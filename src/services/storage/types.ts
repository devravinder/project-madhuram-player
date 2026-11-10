import type { MediaKind } from "@/types/music";

// A track as providers exchange it; dates are ISO strings so it can be stored as JSON.
export type TrackMeta = {
  id: string;
  kind: MediaKind;
  title: string;
  artist: string;
  album: string;
  duration: number;
  mime: string;
  bytes: number;
  sha256?: string;
  addedAt: string;
  updatedAt: string;
};

export type TrackFiles = {
  media: File;
  cover?: File;
};

export class TrackNotFoundError extends Error {
  constructor(id: string) {
    super(`Track not found: ${id}`);
  }
}

export interface StorageProvider {
  readonly id: string;
  readonly label: string;
  readonly writable: boolean;
  listTracks(): Promise<TrackMeta[]>;
  getTrack(id: string): Promise<TrackMeta | undefined>;
  readTrackFiles(id: string): Promise<TrackFiles>;
  writeTrack(meta: TrackMeta, files: TrackFiles): Promise<void>;
  removeTrack(id: string): Promise<void>;
}
