import { GithubApi } from "./api";
import { findOrCreateLibrary, type Sleep } from "./discovery";
import type { LibraryConfig } from "./indexTypes";
import { LibraryRepo } from "./library";

// The chosen repo name exists and belongs to something else.
export class LibraryNameTakenError extends Error {
  readonly repo: string;

  constructor(repo: string) {
    super(
      `A repository named ${repo} already exists and is not a Madhuram library.`,
    );
    this.repo = repo;
  }
}

export type OpenLibraryOptions = {
  token: string;
  login: string;
  repoName: string;
  config: LibraryConfig;
  fetchFn?: typeof fetch;
  sleep?: Sleep;
};

// Finds, adopts or creates the library repo for this account.
export async function openLibrary(options: OpenLibraryOptions) {
  const api = new GithubApi(options.token, options.fetchFn);
  const found = await findOrCreateLibrary(
    api,
    options.login,
    options.repoName,
    options.config,
    options.sleep,
  );
  if (found.status === "name-taken") throw new LibraryNameTakenError(found.repo);

  return {
    library: new LibraryRepo(api, options.login, options.repoName, found.branch),
    status: found.status,
  };
}