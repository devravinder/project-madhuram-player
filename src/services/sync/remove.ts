import type { LibraryIndex, RepoInfo } from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";
import { manifestPath } from "./split";
import { commitShardParts } from "./upload";

// Every part of a track sits in this folder, in whichever repo holds it.
export const trackFolder = (trackId: string) =>
  `data/${trackId.slice(0, 2)}/${trackId}`;

const sumBytes = (entries: { size?: number }[]) =>
  entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0);

// Lowers a repo's usage and reopens it when a part fits again.
function freeSpace(index: LibraryIndex, freed: Map<string, number>): RepoInfo[] {
  return index.repos.map((repo) => {
    const bytes = freed.get(repo.name);
    if (!bytes) return repo;
    const usedBytes = Math.max(0, repo.usedBytes - bytes);
    const room = index.config.maxRepoBytes - usedBytes >= index.config.maxFileBytes;
    return { ...repo, usedBytes, full: repo.full && !room };
  });
}

// Deletes a track from GitHub: marks it deleted in the index so other
// devices remove it too, and removes its manifest and file parts from
// every repo to free the space. Safe to run again after a failure.
export async function removeRemoteTrack(library: LibraryRepo, trackId: string) {
  const { api, owner } = library;
  const folder = trackFolder(trackId);
  const now = new Date().toISOString();

  // The index goes first, so it never points at parts that are gone.
  const index = await library.update(async (current, state) => {
    const files = await api.listFolderFiles(owner, library.repo, state.head.treeSha, folder);
    const manifest = await library.readText(manifestPath(trackId), state.head);
    const entry = current.tracks.find((t) => t.id === trackId);
    const tombstoned = !entry || entry.deleted;
    if (tombstoned && !files.length && manifest === undefined) return undefined;

    return {
      message: `Remove ${entry?.title ?? trackId}`,
      index: {
        ...current,
        tracks: current.tracks.map((t) =>
          t.id === trackId && !t.deleted ? { ...t, deleted: true, updatedAt: now } : t,
        ),
        repos: freeSpace(current, new Map([[library.repo, sumBytes(files)]])),
      },
      remove: [
        ...files.map((file) => file.path),
        ...(manifest === undefined ? [] : [manifestPath(trackId)]),
      ],
    };
  });

  // Then the overflow repos, each with its own commit.
  const freed = new Map<string, number>();
  for (const repo of index.repos) {
    if (repo.name === library.repo) continue;
    const info = await api.getRepo(owner, repo.name);
    const head = info && (await api.getHead(owner, repo.name, info.default_branch));
    if (!head) continue;
    const files = await api.listFolderFiles(owner, repo.name, head.treeSha, folder);
    if (!files.length) continue;
    await commitShardParts(
      api,
      owner,
      repo.name,
      `Remove ${trackId}`,
      files.map((file) => ({ path: file.path, sha: null })),
    );
    freed.set(repo.name, sumBytes(files));
  }

  if (freed.size) {
    await library.update((current) => ({
      message: "Update repository usage",
      index: { ...current, repos: freeSpace(current, freed) },
    }));
  }
}
