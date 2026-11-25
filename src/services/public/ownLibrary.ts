import { GithubApi } from "@/services/github/api";
import {
  NotLibraryIndexError,
  UnsupportedIndexVersionError,
  type LibraryIndex,
  type Manifest,
  type PartRef,
} from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";
import { HttpError } from "@/services/httpError";
import { PublicLibraryError, rawUrl, TrackFileMissingError } from "./publicLibrary";

// One of the signed-in user's own libraries, read with the token so private
// ones work too. Public ones still stream from their raw URLs.
export class OwnLibrary {
  readonly owner: string;
  readonly repo: string;
  readonly api: GithubApi;

  constructor(api: GithubApi, owner: string, repo: string) {
    this.api = api;
    this.owner = owner;
    this.repo = repo;
  }

  // Asked each time, so a visibility change is seen straight away.
  private async info() {
    const repo = await this.api.getRepo(this.owner, this.repo);
    if (!repo) {
      throw new PublicLibraryError("not-found", `${this.owner}/${this.repo} was not found.`);
    }
    return { library: new LibraryRepo(this.api, this.owner, this.repo, repo.default_branch), isPrivate: repo.private };
  }

  async library(): Promise<LibraryRepo> {
    return (await this.info()).library;
  }

  async loadIndex(): Promise<LibraryIndex> {
    let index: LibraryIndex;
    try {
      index = (await (await this.library()).read()).index;
    } catch (error) {
      if (error instanceof UnsupportedIndexVersionError) {
        throw new PublicLibraryError("unsupported", error.message);
      }
      if (error instanceof NotLibraryIndexError) throw this.notLibrary();
      throw error;
    }
    if (index.role !== "library") throw this.notLibrary();
    return index;
  }

  private notLibrary() {
    return new PublicLibraryError("not-library", `${this.owner}/${this.repo} is not a Madhuram library.`);
  }

  async loadManifest(path: string): Promise<Manifest> {
    const text = await (await this.library()).readText(path);
    if (!text) throw new TrackFileMissingError();
    return JSON.parse(text) as Manifest;
  }

  // A one-part file of a public library plays from its URL; a private one
  // has to be downloaded with the token first.
  async streamUrl(file: { parts: PartRef[] } | undefined): Promise<string | undefined> {
    if (!file || file.parts.length !== 1) return undefined;
    const { isPrivate } = await this.info();
    return isPrivate ? undefined : rawUrl(this.owner, file.parts[0].repo, file.parts[0].path);
  }

  readPart = async (part: PartRef): Promise<Blob> => {
    try {
      return await this.api.readBlob(this.owner, part.repo, part.sha);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) throw new TrackFileMissingError();
      throw error;
    }
  };
}
