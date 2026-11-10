import { GithubApi, isConflict } from "@/services/github/api";
import {
  SCHEMA_VERSION,
  type FileRef,
  type LibraryIndex,
  type Manifest,
  type PartRef,
  type TrackEntry,
} from "@/services/github/indexTypes";
import { realSleep, type Sleep } from "@/services/github/discovery";
import { LibraryRepo } from "@/services/github/library";
import { rolloverRepo } from "@/services/github/shards";
import { sha256Hex } from "@/services/hash";
import type { TrackFiles, TrackMeta } from "@/services/storage/types";
import { manifestPath, partPath, splitBlob } from "./split";

const MAX_COMMIT_ATTEMPTS = 5;

export class InvalidLimitsError extends Error {
  constructor() {
    super("The file size limit is larger than the repository size limit.");
  }
}

export class RepoFullError extends Error {
  readonly repo: string;

  constructor(repo: string) {
    super(`Repository ${repo} has no room for this file.`);
    this.repo = repo;
  }
}

type Planned = {
  file: "media" | "cover";
  n: number;
  blob: Blob;
  repo: string;
  path: string;
};

export type UploadOptions = {
  onProgress?: (donePartsCount: number, totalParts: number) => void;
  sleep?: Sleep;
};

const MAX_ROLLOVERS = 10;

// Open repos in order of preference: the current one first.
function openRepos(index: LibraryIndex) {
  const open = index.repos.filter((repo) => !repo.full);
  return [
    ...open.filter((repo) => repo.name === index.currentRepo),
    ...open.filter((repo) => repo.name !== index.currentRepo),
  ];
}

// Picks the repo for each part, counting what this upload already planned.
function planParts(
  index: LibraryIndex,
  trackId: string,
  files: TrackFiles,
): Planned[] {
  const planned = new Map<string, number>();
  const result: Planned[] = [];

  for (const file of ["media", "cover"] as const) {
    const source = files[file];
    if (!source) continue;

    splitBlob(source, index.config.maxFileBytes).forEach((blob, n) => {
      const repo = openRepos(index).find(
        (candidate) =>
          candidate.usedBytes + (planned.get(candidate.name) ?? 0) + blob.size <=
          index.config.maxRepoBytes,
      );
      if (!repo) throw new RepoFullError(index.currentRepo);

      planned.set(repo.name, (planned.get(repo.name) ?? 0) + blob.size);
      result.push({ file, n, blob, repo: repo.name, path: partPath(trackId, file, n) });
    });
  }
  return result;
}
// Starts a new shard repo whenever no open repo has room for the parts.
async function planWithRollover(
  library: LibraryRepo,
  trackId: string,
  files: TrackFiles,
  first: LibraryIndex,
  options: UploadOptions,
): Promise<Planned[]> {
  let index = first;
  for (let rollovers = 0; ; rollovers++) {
    try {
      return planParts(index, trackId, files);
    } catch (error) {
      if (!(error instanceof RepoFullError) || rollovers >= MAX_ROLLOVERS) {
        throw error;
      }
      await rolloverRepo(library, options.sleep ?? realSleep);
      index = (await library.read()).index;
    }
  }
}

// Shard repos get their own commit; the primary repo's parts ride with the index.
async function commitShardParts(
  api: GithubApi,
  owner: string,
  repo: string,
  message: string,
  parts: { path: string; sha: string }[],
) {
  const info = await api.getRepo(owner, repo);
  if (!info) throw new Error(`Repository ${repo} is missing.`);

  for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt++) {
    const head = await api.getHead(owner, repo, info.default_branch);
    if (!head) throw new Error(`Repository ${repo} has no commits.`);
    try {
      await api.commitChanges(owner, repo, head, message, parts);
      return;
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }
  throw new Error(`Repository ${repo} keeps changing. Try again shortly.`);
}

const toFileRef = (
  file: File,
  sha256: string,
  parts: PartRef[],
): FileRef => ({
  name: file.name,
  mime: file.type,
  bytes: file.size,
  sha256,
  parts,
});

export async function uploadTrack(
  library: LibraryRepo,
  meta: TrackMeta,
  files: TrackFiles,
  options: UploadOptions = {},
): Promise<TrackEntry> {
  const { api, owner } = library;
  const mediaSha = await sha256Hex(files.media);

  const { index } = await library.read();
  if (index.config.maxFileBytes > index.config.maxRepoBytes) {
    throw new InvalidLimitsError();
  }
  const existing = index.tracks.find((t) => t.id === meta.id && !t.deleted);
  if (existing?.sha256 === mediaSha) return existing;

  const coverSha = files.cover ? await sha256Hex(files.cover) : undefined;
  const planned = await planWithRollover(library, meta.id, files, index, options);

  // Upload every part; remember each blob id.
  const refs: PartRef[] = [];
  const byRepo = new Map<string, { path: string; sha: string }[]>();
  for (const [done, part] of planned.entries()) {
    const sha = await api.createBlob(owner, part.repo, part.blob);
    refs.push({ n: part.n, repo: part.repo, path: part.path, bytes: part.blob.size, sha });
    byRepo.set(part.repo, [...(byRepo.get(part.repo) ?? []), { path: part.path, sha }]);
    options.onProgress?.(done + 1, planned.length);
  }

  const addedBytes = new Map<string, number>();
  for (const part of planned) {
    addedBytes.set(part.repo, (addedBytes.get(part.repo) ?? 0) + part.blob.size);
  }

  const message = `Add ${meta.title}`;
  for (const [repo, parts] of byRepo) {
    if (repo !== library.repo) await commitShardParts(api, owner, repo, message, parts);
  }

  const partsOf = (file: "media" | "cover") =>
    planned
      .filter((p) => p.file === file)
      .map((p) => refs.find((r) => r.path === p.path)!);

  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    trackId: meta.id,
    media: toFileRef(files.media, mediaSha, partsOf("media")),
    cover:
      files.cover && coverSha
        ? toFileRef(files.cover, coverSha, partsOf("cover"))
        : undefined,
  };

  const entry: TrackEntry = {
    ...meta,
    bytes: files.media.size,
    sha256: mediaSha,
    manifest: manifestPath(meta.id),
  };

  await library.update((current) => {
    const tracks = current.tracks.filter((t) => t.id !== meta.id);
    const repos = current.repos.map((repo) => ({
      ...repo,
      usedBytes: repo.usedBytes + (addedBytes.get(repo.name) ?? 0),
    }));
    return {
      message,
      index: { ...current, tracks: [...tracks, entry], repos },
      text: [{ path: entry.manifest, content: JSON.stringify(manifest, null, 2) }],
      blobs: byRepo.get(library.repo) ?? [],
    };
  });

  return entry;
}
