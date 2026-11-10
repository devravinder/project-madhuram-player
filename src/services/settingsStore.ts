import { config } from "@/config";

const REPO_NAME_KEY = "madhuram.libraryRepo";

// GitHub allows letters, digits, dots, dashes and underscores.
export const isValidRepoName = (name: string) =>
  /^[A-Za-z0-9._-]{1,100}$/.test(name) &&
  name !== "." &&
  name !== ".." &&
  !name.endsWith(".git");

export function getLibraryRepoName(): string {
  try {
    return localStorage.getItem(REPO_NAME_KEY) || config.libraryRepoName;
  } catch {
    return config.libraryRepoName;
  }
}

export function setLibraryRepoName(name: string) {
  try {
    localStorage.setItem(REPO_NAME_KEY, name);
  } catch {
    // Storage can be blocked; the name then lasts until reload.
  }
}
