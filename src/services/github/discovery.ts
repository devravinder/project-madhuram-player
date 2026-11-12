import { GithubApi } from "./api";
import {
  createEmptyIndex,
  INDEX_PATH,
  NotLibraryIndexError,
  parseIndex,
  serializeIndex,
  type IndexRole,
  type LibraryConfig,
  type LibraryIndex,
} from "./indexTypes";

export type Discovery =
  | {
      status: "created" | "adopted" | "reused";
      repo: string;
      branch: string;
      index: LibraryIndex;
    }
  | { status: "name-taken"; repo: string };

// Files an empty repository is allowed to have, such as an auto-made README.
const HARMLESS_ROOT_FILES = /^(readme(\.\w+)?|license(\.\w+)?|\.gitignore)$/i;

const HEAD_ATTEMPTS = 6;
const HEAD_DELAY_MS = 1000;

export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function writeTextFile(
  api: GithubApi,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  text: string,
  message: string,
) {
  const head = await api.getHead(owner, repo, branch);

  if (!head) {
    await api.putFile(owner, repo, path, text, message);
    return;
  }
  const blob = await api.createTextBlob(owner, repo, text);
  await api.commitChanges(owner, repo, head, message, [{ path, sha: blob }]);
}

const writeIndex = (
  api: GithubApi,
  owner: string,
  repo: string,
  branch: string,
  index: LibraryIndex,
) =>
  writeTextFile(
    api,
    owner,
    repo,
    branch,
    INDEX_PATH,
    serializeIndex(index),
    index.role === "home" ? "Create home" : "Create library index",
  );

// A new repository takes a moment before its first commit is readable.
export async function waitForHead(
  api: GithubApi,
  owner: string,
  repo: string,
  branch: string,
  sleep: Sleep,
) {
  for (let attempt = 1; attempt <= HEAD_ATTEMPTS; attempt++) {
    if (await api.getHead(owner, repo, branch)) return;
    await sleep(HEAD_DELAY_MS);
  }
}

// A library repo: songs, public or private as a whole.
export const findOrCreateLibrary = (
  api: GithubApi,
  owner: string,
  repoName: string,
  config: LibraryConfig,
  sleep: Sleep = realSleep,
) =>
  findOrCreateRepo(api, owner, repoName, "library", () => createEmptyIndex(repoName, config), sleep);

// Reuse a repo with the expected kind of index, adopt an empty repo, create
// a missing one, and never touch a repo that belongs to something else.
// `newIndex` makes the index for a created or adopted repo.
export async function findOrCreateRepo(
  api: GithubApi,
  owner: string,
  repoName: string,
  role: IndexRole,
  newIndex: () => LibraryIndex,
  sleep: Sleep = realSleep,
): Promise<Discovery> {
  const repo = await api.getRepo(owner, repoName);

  if (!repo) {
    const created = await api.createRepo(
      repoName,
      role === "home" ? "Madhuram home: playlists and settings" : "Madhuram music library",
    );
    await waitForHead(api, owner, repoName, created.default_branch, sleep);
    const index = newIndex();
    await writeIndex(api, owner, repoName, created.default_branch, index);
    return { status: "created", repo: repoName, branch: created.default_branch, index };
  }

  const head = await api.getHead(owner, repoName, repo.default_branch);
  const existing = head
    ? await api.getFileInTree(owner, repoName, head.treeSha, INDEX_PATH)
    : null;
  if (existing) {
    try {
      const index = parseIndex(existing.text);
      if (index.role !== role) return { status: "name-taken", repo: repoName };
      return { status: "reused", repo: repoName, branch: repo.default_branch, index };
    } catch (error) {
      if (error instanceof NotLibraryIndexError) {
        return { status: "name-taken", repo: repoName };
      }
      throw error;
    }
  }

  const root = head ? await api.getTree(owner, repoName, head.treeSha) : null;
  const isEmpty = !root || root.every((entry) => HARMLESS_ROOT_FILES.test(entry.path));
  if (!isEmpty) return { status: "name-taken", repo: repoName };

  const index = newIndex();
  await writeIndex(api, owner, repoName, repo.default_branch, index);
  return { status: "adopted", repo: repoName, branch: repo.default_branch, index };
}
