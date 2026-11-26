import { LIBRARY_DESCRIPTION } from "@/services/github/discovery";
import { HttpError, RateLimitError } from "@/services/httpError";
import {
  APP_MARKER,
  INDEX_PATH,
  parseIndex,
} from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";
import { recoverShards, SHARD_MARKER_PATH } from "@/services/github/shards";

// Unfollow records on GitHub are kept this long, for devices that were
// away, then forgotten.
export const KEEP_UNFOLLOWS_MS = 90 * 24 * 60 * 60 * 1000;

// Overflow repos left out of their library's list by a lost update are
// put back, so their files are cleaned too.
export async function recoverAllShards(libraries: LibraryRepo[]) {
  for (const library of libraries) await recoverShards(library);
}

// Which library an overflow repo belongs to, from its marker file.
async function shardLibrary(home: LibraryRepo, repo: string) {
  const file = await home.api.getFile(home.owner, repo, SHARD_MARKER_PATH);
  if (!file) return undefined;
  try {
    const marker = JSON.parse(file.text) as {
      app?: string;
      role?: string;
      library?: string;
    };
    return marker.app === APP_MARKER && marker.role === "shard"
      ? marker.library
      : undefined;
  } catch {
    return undefined;
  }
}

async function isLibraryRepo(home: LibraryRepo, repo: string) {
  const file = await home.api.getFile(home.owner, repo, INDEX_PATH);
  if (!file) return false;
  try {
    return parseIndex(file.text).role === "library";
  } catch {
    return false;
  }
}

// The user's music repos no library uses any more: a deleted library
// GitHub refused to delete, its overflow repos, or repos from an old
// setup. Only listed; the user deletes them on GitHub.
export async function findLeftoverRepos(
  home: LibraryRepo,
  libraries: LibraryRepo[],
  listed: string[], // the libraries in the home repo
): Promise<string[]> {
  const inUse = new Set([home.repo, ...listed]);
  for (const library of libraries) {
    for (const repo of (await library.read()).index.repos) inUse.add(repo.name);
  }
  const candidates = (await home.api.listOwnRepos()).filter(
    (repo) =>
      !inUse.has(repo.name) &&
      repo.description?.startsWith(LIBRARY_DESCRIPTION),
  );

  const leftovers: string[] = [];
  for (const repo of candidates) {
    const owner = await shardLibrary(home, repo.name);
    const unused =
      owner !== undefined
        ? !listed.includes(owner)
        : await isLibraryRepo(home, repo.name);
    if (unused) leftovers.push(repo.name);
  }
  return leftovers.sort();
}

// Forgets unfollows GitHub has kept for long enough. Returns how many.
export async function pruneUnfollows(home: LibraryRepo, now = Date.now()) {
  let pruned = 0;
  await home.update((current) => {
    const sources = current.sources ?? [];
    const kept = sources.filter(
      (s) => !s.removed || now - Date.parse(s.updatedAt) < KEEP_UNFOLLOWS_MS,
    );
    pruned = sources.length - kept.length;
    if (!pruned) return undefined;
    return {
      message: "Forget old unfollows",
      index: { ...current, sources: kept },
    };
  });
  return pruned;
}

// Deletes the chosen leftover repos on GitHub. They are looked up again
// first, so a repo that came back into use meanwhile is never deleted.
export async function deleteLeftoverRepos(
  home: LibraryRepo,
  libraries: LibraryRepo[],
  listed: string[],
  names: string[],
) {
  const leftovers = await findLeftoverRepos(home, libraries, listed);
  const chosen = leftovers.filter((name) => names.includes(name));
  const deleted: string[] = [];
  const failed: string[] = [];
  for (const name of chosen) {
    try {
      await home.api.deleteRepo(home.owner, name);
      deleted.push(name);
    } catch (error) {
      // Offline or a rate limit stops here; a refusal is reported.
      if (!(error instanceof HttpError) || error instanceof RateLimitError)
        throw error;
      failed.push(name);
    }
  }
  return {
    deleted,
    failed,
    remaining: leftovers.filter((name) => !deleted.includes(name)),
  };
}
