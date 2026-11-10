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

const SYNC_MODE_KEY = "madhuram.syncMode";
const SYNC_MODES = ["both", "upload", "download"] as const;
export type SavedSyncMode = (typeof SYNC_MODES)[number];

// The last sync mode, so unfinished work resumes the same way after a restart.
export function getLastSyncMode(): SavedSyncMode {
  try {
    const saved = localStorage.getItem(SYNC_MODE_KEY);
    return SYNC_MODES.find((mode) => mode === saved) ?? "both";
  } catch {
    return "both";
  }
}

export function setLastSyncMode(mode: SavedSyncMode) {
  try {
    localStorage.setItem(SYNC_MODE_KEY, mode);
  } catch {
    // Storage can be blocked; a restart then resumes with a full sync.
  }
}
