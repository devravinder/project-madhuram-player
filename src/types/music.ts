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
  coverImageId?: string; // cover art, or a poster frame for video
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
