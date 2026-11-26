import db from "@/services/db";
import { deleteSong } from "@/services/songsService";
import { isBackedUp, removeFromDeviceOnly } from "@/services/sync/deleteTrack";

// A file saved in the last hour may belong to a song still being added
// (an import or a download saves the file first, then the song).
export const FILE_MIN_AGE_MS = 60 * 60 * 1000;
// Parts of an unfinished download are kept a day for it to carry on.
export const PART_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export type DeviceCleanResult = {
  items: number;
  bytes: number;
  brokenSongs: number; // songs whose file was gone, removed
};

export type DeviceCleanOptions = {
  now?: number;
  downloading?: boolean; // a download is running; its parts stay
  signedIn?: boolean; // unfollows wait to reach the other devices
};

// A song whose file is gone (the browser cleared it) cannot play. A
// backed-up one is kept on GitHub only, so Download brings it back;
// any other is removed.
async function removeBrokenSongs(): Promise<number> {
  const songs = await db.songs.toArray();
  const present = new Set(
    await db.files
      .where(":id")
      .anyOf(songs.map((s) => s.mediaId))
      .primaryKeys(),
  );
  const broken = songs.filter((s) => !present.has(s.mediaId));
  for (const song of broken) {
    if (await isBackedUp(song.id)) await removeFromDeviceOnly(song.id);
    else await deleteSong(song.id);
  }
  return broken.length;
}

// Removes what no song uses any more: stored files, kept parts of
// downloads, records of uploads that will not carry on, and songs whose
// file is gone.
export async function cleanDevice({
  now = Date.now(),
  downloading = false,
  signedIn = false,
}: DeviceCleanOptions = {}): Promise<DeviceCleanResult> {
  // While something downloads, a song can briefly be without its file.
  const brokenSongs = downloading ? 0 : await removeBrokenSongs();
  const songs = await db.songs.toArray();
  const used = new Set(
    songs.flatMap((s) => [s.mediaId, s.coverImageId]).filter(Boolean),
  );
  const saved = new Set(songs.map((s) => s.sha256).filter(Boolean));
  const songIds = new Set(songs.map((s) => s.id));
  let items = 0;
  let bytes = 0;

  const files = await db.files
    .filter(
      (f) =>
        !used.has(f.id) &&
        now - new Date(f.createdAt).getTime() >= FILE_MIN_AGE_MS,
    )
    .toArray();
  await db.files.bulkDelete(files.map((f) => f.id));
  items += files.length;
  bytes += files.reduce((sum, f) => sum + f.data.size, 0);

  const parts = await db.downloadedParts
    .filter(
      (p) =>
        saved.has(p.fileSha256) ||
        (!downloading && now - p.savedAt >= PART_MIN_AGE_MS),
    )
    .toArray();
  await db.downloadedParts.bulkDelete(parts.map((p) => p.id));
  items += parts.length;
  bytes += parts.reduce((sum, p) => sum + p.data.size, 0);

  // An upload carries on only while its song and its queued step exist.
  const pushes = new Set(
    (await db.outbox.toArray())
      .filter((i) => i.op === "push")
      .map((i) => i.trackId),
  );
  const uploads = await db.uploadedParts
    .filter((p) => !songIds.has(p.trackId) || !pushes.has(p.trackId))
    .toArray();
  await db.uploadedParts.bulkDelete(uploads.map((p) => p.id));
  items += uploads.length;

  // Signed in, sync removes unfollows once GitHub has them.
  if (!signedIn) {
    const unfollowed = await db.followedSources
      .filter((s) => !!s.removed)
      .primaryKeys();
    await db.followedSources.bulkDelete(unfollowed);
    items += unfollowed.length;
  }

  return { items: items + brokenSongs, bytes, brokenSongs };
}
