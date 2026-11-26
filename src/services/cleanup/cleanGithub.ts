import type { Head, TreeEntry } from "@/services/github/api";
import type {
  LibraryIndex,
  Manifest,
  TrackEntry,
} from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";
import { commitShardParts } from "@/services/sync/upload";

// Files left behind on GitHub: parts of uploads that never finished (a
// song deleted before its upload was done), parts of deletes cut short,
// and parts a newer upload of the same song no longer uses. Anything
// changed in the last day is left alone, so an upload running on another
// device right now is never touched.
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

const CLEANUP_MESSAGE = "Clean up unused files";

export type GithubCleanResult = { files: number; bytes: number };

type RepoScan = {
  repo: string;
  head: Head;
  files: TreeEntry[]; // every file, with its size
  truncated: boolean;
};

type Orphan = { repo: string; path: string; bytes: number; trackId: string };

// data/<2 letters>/<track id>/<media|cover>.<n>
const trackIdOf = (path: string) => path.split("/")[2];
const folderOf = (path: string) => path.split("/").slice(0, 3).join("/");
const manifestIdOf = (path: string) =>
  path.match(/^manifests\/(.+)\.json$/)?.[1];

const isPart = (path: string) =>
  path.startsWith("data/") && path.split("/").length === 4;

async function scanRepo(
  library: LibraryRepo,
  repo: string,
  primaryHead: Head,
): Promise<RepoScan | undefined> {
  const { api, owner } = library;
  let head: Head | null = primaryHead;
  if (repo !== library.repo) {
    const info = await api.getRepo(owner, repo);
    head = info && (await api.getHead(owner, repo, info.default_branch));
  }
  if (!head) return undefined;
  const { files, truncated } = await api.getAllFiles(owner, repo, head.treeSha);
  return { repo, head, files, truncated };
}

// Parts a live track's manifest does not name. The manifest is read only
// when the media parts found do not add up to the song's size.
async function strayParts(
  library: LibraryRepo,
  head: Head,
  entry: TrackEntry,
  parts: Orphan[],
): Promise<Orphan[]> {
  const mediaBytes = parts
    .filter((part) => part.path.split("/")[3].startsWith("media."))
    .reduce((sum, part) => sum + part.bytes, 0);
  if (mediaBytes === entry.bytes) return [];

  const text = await library.readText(entry.manifest, head);
  if (!text) return []; // unsure what belongs to it; leave it
  const manifest = JSON.parse(text) as Manifest;
  const named = new Set(
    [...manifest.media.parts, ...(manifest.cover?.parts ?? [])].map(
      (part) => `${part.repo}:${part.path}`,
    ),
  );
  return parts.filter((part) => !named.has(`${part.repo}:${part.path}`));
}

async function findOrphans(
  library: LibraryRepo,
  index: LibraryIndex,
  scans: RepoScan[],
  primaryHead: Head,
) {
  const live = new Map(
    index.tracks.filter((t) => !t.deleted).map((t) => [t.id, t]),
  );
  const byTrack = new Map<string, Orphan[]>();
  const orphans: Orphan[] = [];

  for (const scan of scans) {
    for (const file of scan.files) {
      const bytes = file.size ?? 0;
      if (isPart(file.path)) {
        const part = {
          repo: scan.repo,
          path: file.path,
          bytes,
          trackId: trackIdOf(file.path),
        };
        byTrack.set(part.trackId, [...(byTrack.get(part.trackId) ?? []), part]);
      } else if (scan.repo === library.repo) {
        const id = manifestIdOf(file.path);
        if (id && !live.has(id))
          orphans.push({
            repo: scan.repo,
            path: file.path,
            bytes,
            trackId: id,
          });
      }
    }
  }

  for (const [trackId, parts] of byTrack) {
    const entry = live.get(trackId);
    if (!entry) orphans.push(...parts);
    else
      orphans.push(...(await strayParts(library, primaryHead, entry, parts)));
  }
  return orphans;
}

// Keeps only what nothing changed in the last day. One check per folder.
async function oldEnough(library: LibraryRepo, orphans: Orphan[], now: number) {
  const checked = new Map<string, boolean>();
  const kept: Orphan[] = [];
  for (const orphan of orphans) {
    const place = orphan.path.startsWith("data/")
      ? folderOf(orphan.path)
      : orphan.path;
    const key = `${orphan.repo}:${place}`;
    if (!checked.has(key)) {
      const changed = await library.api.lastChanged(
        library.owner,
        orphan.repo,
        place,
      );
      checked.set(
        key,
        !!changed && now - changed.getTime() >= ORPHAN_MIN_AGE_MS,
      );
    }
    if (checked.get(key)) kept.push(orphan);
  }
  return kept;
}

// Usage as it really is: the parts each repo holds, after the clean up.
function actualUsage(
  index: LibraryIndex,
  scans: RepoScan[],
  removed: Orphan[],
) {
  const gone = new Set(removed.map((o) => `${o.repo}:${o.path}`));
  return index.repos.map((repo) => {
    const scan = scans.find((s) => s.repo === repo.name);
    if (!scan) return repo;
    const usedBytes = scan.files
      .filter((f) => isPart(f.path) && !gone.has(`${repo.name}:${f.path}`))
      .reduce((sum, f) => sum + (f.size ?? 0), 0);
    const room =
      index.config.maxRepoBytes - usedBytes >= index.config.maxFileBytes;
    return { ...repo, usedBytes, full: repo.full && !room };
  });
}

const sameUsage = (a: LibraryIndex["repos"], b: LibraryIndex["repos"]) =>
  a.length === b.length &&
  a.every(
    (repo, i) => repo.usedBytes === b[i].usedBytes && repo.full === b[i].full,
  );

// The track is as it was at the scan: same file, still deleted or not.
function sameTrack(before: LibraryIndex, after: LibraryIndex, trackId: string) {
  const was = before.tracks.find((t) => t.id === trackId);
  const now = after.tracks.find((t) => t.id === trackId);
  return (
    (was?.sha256 ?? "") === (now?.sha256 ?? "") &&
    !!was?.deleted === !!now?.deleted
  );
}

// Removes unused files from a library's repos and corrects the space each
// repo is counted as using. Deleted files stay in git history.
export async function cleanGithubLibrary(
  library: LibraryRepo,
  now = Date.now(),
): Promise<GithubCleanResult> {
  const { index, head } = await library.read();
  const scans: RepoScan[] = [];
  for (const repo of index.repos) {
    const scan = await scanRepo(library, repo.name, head);
    if (scan) scans.push(scan);
  }
  // A listing GitHub cut short could hide files in use; skip those repos.
  const complete = scans.filter((scan) => !scan.truncated);
  const found = await findOrphans(library, index, complete, head);
  const orphans = await oldEnough(library, found, now);

  // A song uploaded meanwhile keeps its files.
  const { index: latest } = await library.read();
  const removing = orphans.filter((o) => sameTrack(index, latest, o.trackId));

  for (const scan of complete) {
    if (scan.repo === library.repo) continue;
    const paths = removing
      .filter((o) => o.repo === scan.repo)
      .map((o) => ({ path: o.path, sha: null }));
    if (paths.length)
      await commitShardParts(
        library.api,
        library.owner,
        scan.repo,
        CLEANUP_MESSAGE,
        paths,
      );
  }

  const primary = removing.filter((o) => o.repo === library.repo);
  const usage = actualUsage(index, complete, removing);
  await library.update((current, state) => {
    const unchanged = state.head.commitSha === head.commitSha;
    // If the library changed since the scan, its usage is left as counted,
    // and files of songs uploaded meanwhile stay.
    const fixUsage = unchanged && !sameUsage(current.repos, usage);
    const remove = (
      unchanged
        ? primary
        : primary.filter((o) => sameTrack(index, current, o.trackId))
    ).map((o) => o.path);
    if (!remove.length && !fixUsage) return undefined;
    return {
      message: CLEANUP_MESSAGE,
      ...(fixUsage && { index: { ...current, repos: usage } }),
      remove,
    };
  });

  return {
    files: removing.length,
    bytes: removing.reduce((sum, o) => sum + o.bytes, 0),
  };
}
