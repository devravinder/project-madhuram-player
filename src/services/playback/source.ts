import { getFile } from "@/services/filesService";
import { findLocalCopy, resolveRemote } from "@/services/public/remote";
import { PublicLibraryError, TrackFileMissingError } from "@/services/public/publicLibrary";
import { IntegrityError } from "@/services/sync/download";
import type { Song } from "@/types/music";

// Where a track's bytes come from, and the object URLs to free afterwards.
export type PlaybackSource = {
  src: string;
  coverUrl?: string;
  coverType?: string;
  objectUrls: string[];
};

async function fromDevice(song: Song): Promise<PlaybackSource | undefined> {
  const [media, cover] = await Promise.all([
    getFile(song.mediaId),
    song.coverImageId ? getFile(song.coverImageId) : undefined,
  ]);
  if (!media) return undefined;

  const src = URL.createObjectURL(media.data);
  const coverUrl = cover && URL.createObjectURL(cover.data);
  return {
    src,
    coverUrl,
    coverType: cover?.data.type,
    objectUrls: coverUrl ? [src, coverUrl] : [src],
  };
}

export type ResolveHooks = { onDownloadStart?: () => void };

// Undefined means a local file is missing. Remote problems are thrown.
export async function resolveSource(
  song: Song,
  hooks: ResolveHooks = {},
): Promise<PlaybackSource | undefined> {
  if (!song.remote) return fromDevice(song);

  // A saved copy plays offline and without any network use.
  const copy = await findLocalCopy(song.sha256);
  const local = copy && (await fromDevice(copy));
  if (local) return local;

  const playable = await resolveRemote(song, hooks.onDownloadStart);
  if (playable.mode === "stream") {
    return { src: playable.url, coverUrl: playable.coverUrl, objectUrls: [] };
  }
  const src = URL.createObjectURL(playable.file);
  return { src, coverUrl: playable.coverUrl, objectUrls: [src] };
}

export function playbackErrorMessage(error: unknown): string {
  if (error instanceof TrackFileMissingError) return error.message;
  if (error instanceof PublicLibraryError) return error.message;
  if (error instanceof IntegrityError) return "The download was incomplete. Try again.";
  return "Unable to play this track.";
}