import { GithubApi, isConflict, type Head, type TreeChange } from "./api";
import {
  INDEX_PATH,
  parseIndex,
  serializeIndex,
  type LibraryIndex,
} from "./indexTypes";

const MAX_ATTEMPTS = 5;

export class LibraryBusyError extends Error {
  constructor() {
    super("The library keeps changing on another device. Try again shortly.");
  }
}

// What one commit to the primary repository carries besides the index.
export type ChangeSet = {
  message: string;
  index: LibraryIndex;
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

  constructor(api: GithubApi, owner: string, repo: string, branch = "main") {
    this.api = api;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
  }

  // Head first, then the index at that exact commit, so a later push
  // makes the update fail instead of silently overwriting it.
  async read(): Promise<LibraryState> {
    const head = await this.api.getHead(this.owner, this.repo, this.branch);
    if (!head) throw new Error(`Repository ${this.repo} has no commits.`);

    const file = await this.api.getFile(
      this.owner,
      this.repo,
      INDEX_PATH,
      head.commitSha,
    );
    if (!file) throw new Error(`Repository ${this.repo} has no ${INDEX_PATH}.`);
    return { index: parseIndex(file.text), head };
  }

  async readText(path: string, head?: Head) {
    const file = await this.api.getFile(
      this.owner,
      this.repo,
      path,
      head?.commitSha,
    );
    return file?.text;
  }

  // Applies `build` to the latest index and commits. If another device
  // pushed meanwhile, it reads again and rebuilds from the new state.
  async update(
    build: (index: LibraryIndex) => ChangeSet | Promise<ChangeSet>,
  ): Promise<LibraryIndex> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const { index, head } = await this.read();
      const change = await build(structuredClone(index));
      const saved = { ...change.index, updatedAt: new Date().toISOString() };

      const changes: TreeChange[] = [
        { path: INDEX_PATH, sha: await this.blob(serializeIndex(saved)) },
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
