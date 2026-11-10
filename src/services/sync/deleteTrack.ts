import db from "@/services/db";
import type { LibraryRepo } from "@/services/github/library";
import { deleteSong } from "@/services/songsService";
import { removeRemoteTrack } from "./remove";

// True when the song has a copy in the GitHub library.
export const isBackedUp = async (trackId: string) =>
  !!(await db.syncState.get(trackId));

const dropQueued = (trackId: string) =>
  db.outbox.bulkDelete([`push:${trackId}`, `pull:${trackId}`]);

// Frees space here and keeps the GitHub copy. Normal syncs leave it
// alone; a download sync brings it back, playlists included.
export async function removeFromDeviceOnly(trackId: string) {
  await deleteSong(trackId, { keepInPlaylists: true });
  await dropQueued(trackId);
  await db.syncState.update(trackId, { deviceRemoved: true });
}

export type DeleteResult = "deleted" | "queued";

// Deletes here, then on GitHub right away. If GitHub cannot be reached
// the sync record stays, so the next full sync finishes the delete.
export async function deleteEverywhere(
  trackId: string,
  library: LibraryRepo | undefined,
): Promise<DeleteResult> {
  await deleteSong(trackId);
  await dropQueued(trackId);
  await db.syncState.update(trackId, { deviceRemoved: false });
  if (!library) return "queued";

  try {
    await removeRemoteTrack(library, trackId);
  } catch {
    return "queued";
  }
  await db.syncState.delete(trackId);
  await db.outbox.delete(`delete-remote:${trackId}`);
  return "deleted";
}
