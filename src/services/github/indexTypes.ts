import type { TrackMeta } from "@/services/storage/types";

export const APP_MARKER = "madhuram";
export const SCHEMA_VERSION = 1;
export const INDEX_PATH = "index.json";
export const PLAYLISTS_PATH = "playlists.json";

export type LibraryConfig = { maxFileBytes: number; maxRepoBytes: number };

export type RepoInfo = { name: string; usedBytes: number; full: boolean };

export type PartRef = {
  n: number;
  repo: string;
  path: string;
  bytes: number;
  sha: string; // git blob id
};

export type FileRef = {
  name: string;
  mime: string;
  bytes: number;
  sha256: string;
  parts: PartRef[];
};

export type Manifest = {
  schemaVersion: number;
  trackId: string;
  media: FileRef;
  cover?: FileRef;
};

// A deleted track stays as a tombstone so other devices remove it too.
export type TrackEntry = TrackMeta & { manifest: string; deleted?: boolean };

// A followed public library; a removed one stays as a tombstone.
export type SourceEntry = {
  address: string; // owner/repo
  updatedAt: string;
  removed?: boolean;
};

// The home repo is private and holds what is personal: playlists, followed
// libraries and the list of the user's libraries. A library holds songs and
// can be public or private as a whole, with its overflow repos.
export type IndexRole = "home" | "library";

export type LibraryIndex = {
  app: typeof APP_MARKER;
  schemaVersion: number;
  role: IndexRole;
  config: LibraryConfig;
  repos: RepoInfo[];
  currentRepo: string;
  tracks: TrackEntry[];
  sources: SourceEntry[]; // followed public libraries (home only)
  libraries?: string[]; // the user's library repos (home only)
  defaultLibrary?: string; // where uploads go unless chosen (home only)
  updatedAt: string;
};

export class NotLibraryIndexError extends Error {
  constructor() {
    super("This repository is not a Madhuram library.");
  }
}

export class UnsupportedIndexVersionError extends Error {
  readonly version: number;

  constructor(version: number) {
    super(
      `This library uses format ${version}, which this version of the app cannot read. Update the app.`,
    );
    this.version = version;
  }
}

export function createEmptyIndex(
  repoName: string,
  config: LibraryConfig,
  now = new Date(),
  role: IndexRole = "library",
): LibraryIndex {
  return {
    app: APP_MARKER,
    schemaVersion: SCHEMA_VERSION,
    role,
    config,
    repos: [{ name: repoName, usedBytes: 0, full: false }],
    currentRepo: repoName,
    tracks: [],
    sources: [],
    updatedAt: now.toISOString(),
  };
}

export function createHomeIndex(
  repoName: string,
  config: LibraryConfig,
  firstLibrary: string,
  now = new Date(),
): LibraryIndex {
  return {
    ...createEmptyIndex(repoName, config, now, "home"),
    libraries: [firstLibrary],
    defaultLibrary: firstLibrary,
  };
}

export function parseIndex(text: string): LibraryIndex {
  let data: Partial<LibraryIndex>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new NotLibraryIndexError();
  }
  if (data?.app !== APP_MARKER || typeof data.schemaVersion !== "number") {
    throw new NotLibraryIndexError();
  }
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new UnsupportedIndexVersionError(data.schemaVersion);
  }
  if (data.role !== "home" && data.role !== "library") throw new NotLibraryIndexError();
  return data as LibraryIndex;
}

export const serializeIndex = (index: LibraryIndex) =>
  `${JSON.stringify(index, null, 2)}\n`;

// A playlist as stored in playlists.json; a deleted one stays as a tombstone.
export type PlaylistEntry = {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  songIds: string[];
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
};

export type PlaylistsFile = {
  schemaVersion: number;
  playlists: PlaylistEntry[];
};

export function parsePlaylists(text: string | undefined): PlaylistEntry[] {
  if (!text) return [];
  try {
    return (JSON.parse(text) as PlaylistsFile).playlists ?? [];
  } catch {
    return [];
  }
}

export const serializePlaylists = (playlists: PlaylistEntry[]) =>
  `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, playlists } satisfies PlaylistsFile, null, 2)}\n`;
