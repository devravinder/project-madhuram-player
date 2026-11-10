import db from "@/services/db";
import type { LibraryIndex, TrackEntry } from "@/services/github/indexTypes";
import { deviceProvider } from "@/services/storage/deviceProvider";
import type { TrackMeta } from "@/services/storage/types";
import { fetchTrackFiles } from "@/services/sync/download";
import { getId } from "@/services/util";
import type { Song } from "@/types/music";
import { PublicLibrary } from "./publicLibrary";

// A remote track shaped like a local one, so lists and the player treat both alike.
export function toRemoteSong(owner: string, repo: string, entry: TrackEntry): Song {
  return {
    id: `${owner}/${repo}:${entry.id}`,
    kind: entry.kind,
    title: entry.title,
    artist: entry.artist,
    album: entry.album,
    duration: entry.duration,
    mime: entry.mime,
    bytes: entry.bytes,
    sha256: entry.sha256,
    addedAt: new Date(entry.addedAt),
    mediaId: "",
    remote: { owner, repo, manifest: entry.manifest },
  };
}

export const remoteSongs = (owner: string, repo: string, index: LibraryIndex) =>
  index.tracks.filter((t) => !t.deleted).map((t) => toRemoteSong(owner, repo, t));

export type PlayableRemote =
  | { mode: "stream"; url: string; coverUrl?: string }
  | { mode: "download"; file: File; coverUrl?: string };

const libraryOf = (song: Song) => {
  if (!song.remote) throw new Error("Not a remote track");
  return new PublicLibrary({ owner: song.remote.owner, repo: song.remote.repo });
};

// One-part files play straight from their URL; split files are downloaded first.
export async function resolveRemote(
  song: Song,
  onDownloadStart?: () => void,
): Promise<PlayableRemote> {
  const library = libraryOf(song);
  const manifest = await library.loadManifest(song.remote!.manifest);
  const coverUrl = library.streamUrl(manifest.cover);

  const url = library.streamUrl(manifest.media);
  if (url) return { mode: "stream", url, coverUrl };

  onDownloadStart?.();
  const files = await fetchTrackFiles(manifest, library.readPart);
  return { mode: "download", file: files.media, coverUrl };
}

// A saved copy is the only form that plays offline.
export const findLocalCopy = (sha256: string | undefined) =>
  sha256 ? db.songs.filter((song) => song.sha256 === sha256).first() : undefined;

// Saves a new, independent local copy of a remote track.
export async function downloadCopy(
  song: Song,
  onPart?: () => void,
): Promise<string> {
  const library = libraryOf(song);
  const manifest = await library.loadManifest(song.remote!.manifest);
  const files = await fetchTrackFiles(manifest, library.readPart, onPart);

  const now = new Date().toISOString();
  const id = getId(36);
  const meta: TrackMeta = {
    id,
    kind: song.kind,
    title: song.title,
    artist: song.artist,
    album: song.album,
    duration: song.duration,
    mime: song.mime,
    bytes: files.media.size,
    sha256: manifest.media.sha256,
    addedAt: now,
    updatedAt: now,
  };
  await deviceProvider.writeTrack(meta, files);
  return id;
}
