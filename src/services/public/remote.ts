import db from "@/services/db";
import { GithubApi } from "@/services/github/api";
import { authStore } from "@/services/github/authStore";
import type { LibraryIndex, TrackEntry } from "@/services/github/indexTypes";
import { deviceProvider } from "@/services/storage/deviceProvider";
import type { TrackMeta } from "@/services/storage/types";
import { fetchTrackFiles } from "@/services/sync/download";
import { pullTrack } from "@/services/sync/engine";
import { getId } from "@/services/util";
import type { Song } from "@/types/music";
import { OwnLibrary } from "./ownLibrary";
import { canStream, streamLink } from "@/services/stream/streamClient";
import { PublicLibrary, TrackFileMissingError } from "./publicLibrary";

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
    remote: { owner, repo, manifest: entry.manifest, trackId: entry.id },
  };
}

export const remoteSongs = (owner: string, repo: string, index: LibraryIndex) =>
  index.tracks.filter((t) => !t.deleted).map((t) => toRemoteSong(owner, repo, t));

export type PlayableRemote =
  | { mode: "stream"; url: string; coverUrl?: string; cover?: Blob }
  | { mode: "download"; file: File; coverUrl?: string; cover?: Blob };

type Reader = PublicLibrary | OwnLibrary;

// The signed-in user's own libraries are read with the token, so private
// ones open too; everyone else's go through the public URLs.
function readerFor(owner: string, repo: string): Reader {
  const { status, token, user } = authStore.getSnapshot();
  if (status === "signed-in" && token && user && user.login.toLowerCase() === owner.toLowerCase()) {
    return new OwnLibrary(new GithubApi(token), user.login, repo);
  }
  return new PublicLibrary({ owner, repo });
}

export type RemoteLibrary = { songs: Song[]; displayName?: string };

export const loadRemoteLibrary = async (owner: string, repo: string): Promise<RemoteLibrary> => {
  const index = await readerFor(owner, repo).loadIndex();
  return { songs: remoteSongs(owner, repo, index), displayName: index.displayName?.trim() || undefined };
};

export const loadRemoteSongs = async (owner: string, repo: string) =>
  (await loadRemoteLibrary(owner, repo)).songs;

const libraryOf = (song: Song) => {
  if (!song.remote) throw new Error("Not a remote track");
  return readerFor(song.remote.owner, song.remote.repo);
};

// One-part files play straight from their URL, and split files of a public
// library part by part; files of a private library are downloaded first.
export async function resolveRemote(
  song: Song,
  onDownloadStart?: () => void,
): Promise<PlayableRemote> {
  const library = libraryOf(song);
  const manifest = await library.loadManifest(song.remote!.manifest);
  const coverUrl = await library.streamUrl(manifest.cover);

  const url = await library.streamUrl(manifest.media);
  if (url) {
    // A private cover has no URL; it is small, so fetch it.
    const cover =
      !coverUrl && manifest.cover?.parts.length === 1
        ? await library.readPart(manifest.cover.parts[0]).catch(() => undefined)
        : undefined;
    return { mode: "stream", url, coverUrl, cover };
  }

  // A split file of a public library plays part by part through the
  // service worker, so only what is played is fetched.
  const parts = await library.publicParts(manifest.media);
  if (parts && (await canStream())) {
    const mime = manifest.media.mime || song.mime || "application/octet-stream";
    return {
      mode: "stream",
      url: streamLink({ mime, size: manifest.media.bytes, parts }),
      coverUrl,
    };
  }

  onDownloadStart?.();
  const files = await fetchTrackFiles(manifest, library.readPart);
  return { mode: "download", file: files.media, coverUrl, cover: coverUrl ? undefined : files.cover };
}

// A saved copy is the only form that plays offline.
export const findLocalCopy = (sha256: string | undefined) =>
  sha256 ? db.songs.filter((song) => song.sha256 === sha256).first() : undefined;

// Saves a remote track on this device. One of the user's own tracks comes
// back as itself, already synced; someone else's becomes a new, independent copy.
export async function downloadCopy(
  song: Song,
  onPart?: () => void,
): Promise<string> {
  const library = libraryOf(song);
  if (library instanceof OwnLibrary && song.remote?.trackId) {
    const restored = await pullTrack(await library.library(), song.remote.trackId, deviceProvider);
    if (!restored) throw new TrackFileMissingError();
    return song.remote.trackId;
  }

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
