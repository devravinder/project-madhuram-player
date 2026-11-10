import { GithubApi, isConflict, type Head, type TreeChange } from "./api";
import { realSleep, type Sleep } from "./discovery";
import {
  INDEX_PATH,
  parseIndex,
  serializeIndex,
  type LibraryIndex,
} from "./indexTypes";

const MAX_ATTEMPTS = 5;
const READ_ATTEMPTS = 4;
const READ_DELAY_MS = 750;

export class LibraryBusyError extends Error {
  constructor() {
    super("The library keeps changing on another device. Try again shortly.");
  }
}

// What one commit to the primary repository carries besides the index.
export type ChangeSet = {
  message: string;
  index?: LibraryIndex; // left out when only other files change
  text?: { path: string; content: string }[];
  blobs?: { path: string; sha: string }[]; // already uploaded to this repo
  remove?: string[];
};

export type LibraryState = { index: LibraryIndex; head: Head };

export class LibraryRepo {
  readonly api: GithubApi;
  readonly owner: string;
  readonly repo: string;
  private readonly branch: string;
  private readonly sleep: Sleep;

  constructor(
    api: GithubApi,
    owner: string,
    repo: string,
    branch = "main",
    sleep: Sleep = realSleep,
  ) {
    this.api = api;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.sleep = sleep;
  }

  // Head first, then the index at that exact commit, so a later push
  // makes the update fail instead of silently overwriting it. Right after
  // a repo is created GitHub can briefly serve an older head, so a
  // missing index is retried a few times before giving up.
  async read(): Promise<LibraryState> {
    for (let attempt = 1; ; attempt++) {
      const head = await this.api.getHead(this.owner, this.repo, this.branch);
      const file = head
        ? await this.api.getFileInTree(
            this.owner,
            this.repo,
            head.treeSha,
            INDEX_PATH,
          )
        : null;
      if (head && file) return { index: parseIndex(file.text), head };

      if (attempt >= READ_ATTEMPTS) {
        throw new Error(
          head
            ? `Repository ${this.repo} has no ${INDEX_PATH}.`
            : `Repository ${this.repo} has no commits.`,
        );
      }
      await this.sleep(READ_DELAY_MS * attempt);
    }
  }

  // Undefined when the file does not exist at that commit.
  async readText(path: string, head?: Head) {
    const at =
      head ?? (await this.api.getHead(this.owner, this.repo, this.branch));
    if (!at) return undefined;
    const file = await this.api.getFileInTree(
      this.owner,
      this.repo,
      at.treeSha,
      path,
    );
    return file?.text;
  }

  // Applies `build` to the latest index and commits. If another device
  // pushed meanwhile, it reads again and rebuilds from the new state.
  // Returning nothing from `build` means there is nothing to commit.
  async update(
    build: (
      index: LibraryIndex,
      state: LibraryState,
    ) => ChangeSet | undefined | Promise<ChangeSet | undefined>,
  ): Promise<LibraryIndex> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const state = await this.read();
      const { index, head } = state;
      const change = await build(structuredClone(index), state);
      if (!change) return index;
      const saved = change.index
        ? { ...change.index, updatedAt: new Date().toISOString() }
        : index;

      const changes: TreeChange[] = [
        ...(change.index
          ? [{ path: INDEX_PATH, sha: await this.blob(serializeIndex(saved)) }]
          : []),
        ...(await Promise.all(
          (change.text ?? []).map(async (file) => ({
            path: file.path,
            sha: await this.blob(file.content),
          })),
        )),
        ...(change.blobs ?? []),
        ...(change.remove ?? []).map((path) => ({ path, sha: null })),
      ];

      try {
        await this.api.commitChanges(
          this.owner,
          this.repo,
          head,
          change.message,
          changes,
        );
        return saved;
      } catch (error) {
        if (!isConflict(error)) throw error;
      }
    }
    throw new LibraryBusyError();
  }

  private blob(text: string) {
    return this.api.createTextBlob(this.owner, this.repo, text);
  }
}
