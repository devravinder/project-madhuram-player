import { GithubApi } from "./api";
import { findOrCreateLibrary, findOrCreateRepo, type Sleep } from "./discovery";
import { createHomeIndex, type LibraryConfig, type LibraryIndex } from "./indexTypes";
import { LibraryRepo } from "./library";

// The chosen repo name exists and belongs to something else.
export class LibraryNameTakenError extends Error {
  readonly repo: string;

  constructor(repo: string) {
    super(`A repository named ${repo} already exists and is not a Madhuram library.`);
    this.repo = repo;
  }
}

export type SessionOptions = {
  api: GithubApi;
  login: string;
  config: LibraryConfig;
  sleep?: Sleep;
};

// Finds, adopts or creates one library repo.
export async function openLibrary(options: SessionOptions, name: string) {
  const { api, login, config, sleep } = options;
  const found = await findOrCreateLibrary(api, login, name, config, sleep);
  if (found.status === "name-taken") throw new LibraryNameTakenError(found.repo);
  return new LibraryRepo(api, login, name, found.branch, sleep);
}

// Finds or creates the private home repo. A new home starts with one
// library, `firstLibrary`, which is created when it is first opened.
export async function openHome(options: SessionOptions, homeName: string, firstLibrary: string) {
  const { api, login, config, sleep } = options;
  const found = await findOrCreateRepo(
    api,
    login,
    homeName,
    "home",
    () => createHomeIndex(homeName, config, firstLibrary),
    sleep,
  );
  if (found.status === "name-taken") throw new LibraryNameTakenError(found.repo);
  return new LibraryRepo(api, login, homeName, found.branch, sleep);
}

export type HomeInfo = { libraries: string[]; defaultLibrary: string };

export const homeInfo = (index: LibraryIndex): HomeInfo => {
  const libraries = index.libraries ?? [];
  return {
    libraries,
    defaultLibrary:
      index.defaultLibrary && libraries.includes(index.defaultLibrary)
        ? index.defaultLibrary
        : libraries[0],
  };
};

// Adds a library to the home list, or replaces `replacing` with it (for a
// name that turned out to be taken). The first library becomes the default.
export async function saveLibrary(home: LibraryRepo, name: string, replacing?: string) {
  const index = await home.update((current) => {
    const list = (current.libraries ?? []).filter((n) => n !== replacing);
    if (list.includes(name) && !replacing) return undefined;
    const libraries = list.includes(name) ? list : [...list, name];
    const defaultLibrary =
      !current.defaultLibrary || current.defaultLibrary === replacing
        ? name
        : current.defaultLibrary;
    return { message: `Add library ${name}`, index: { ...current, libraries, defaultLibrary } };
  });
  return homeInfo(index);
}

export async function setDefaultLibrary(home: LibraryRepo, name: string) {
  const index = await home.update((current) => {
    if (!current.libraries?.includes(name) || current.defaultLibrary === name) return undefined;
    return { message: `Upload to ${name} by default`, index: { ...current, defaultLibrary: name } };
  });
  return homeInfo(index);
}

// The next free default-looking name: project-music-files, -2, -3 ...
export function suggestLibraryName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const name = `${base}-${n}`;
    if (!taken.includes(name)) return name;
  }
}
