export type MediaKind = "audio" | "video";

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  addedAt: Date;
  kind: MediaKind;
  mediaId: string; // key of the audio or video file
  mime: string;
  bytes: number;
  sha256?: string; // set when the track is synced
  updatedAt?: Date;
  coverImageId?: string; // cover art, or a poster frame for video
  // Set for a track that lives in a public library and is not saved here.
  remote?: { owner: string; repo: string; manifest: string };
  coverUrl?: string; // cover shown straight from its URL, for remote tracks
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  songIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type RepeatMode = "off" | "one" | "all";

export interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  queue: Song[];
  queueIndex: number;
}

export interface SleepTimer {
  isActive: boolean;
  endTime: number | null;
  duration: number; // in minutes
}

export type SortOption =
  | "name-asc"
  | "name-desc"
  | "date-asc"
  | "date-desc"
  | "none";

export type AppFile = {
  id: string;
  data: File;
  createdAt: Date;
};

export type OutboxOp = "push" | "pull" | "delete-remote" | "delete-local";

// One queued sync step; the key makes queuing the same step twice a no-op.
export type OutboxItem = {
  id: string; // `${op}:${trackId}`
  op: OutboxOp;
  trackId: string;
  status: "pending" | "running" | "failed";
  attempts: number;
  lastError?: string;
  nextAttemptAt: number;
  createdAt: number;
};

// What the device and the library agreed on at the last successful sync.
export type SyncRecord = {
  trackId: string;
  sha256: string;
  // Removed from this device on purpose but kept on GitHub; a download
  // sync brings it back, other syncs leave it alone.
  deviceRemoved?: boolean;
};

export type PlaylistTombstone = {
  id: string;
  deletedAt: Date;
};

// A public library the user listens to, as owner/repo.
export type FollowedSource = {
  address: string;
  updatedAt: Date;
  removed?: boolean; // kept so an unfollow reaches other devices
};
