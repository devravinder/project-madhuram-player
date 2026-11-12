import db from "@/services/db";
import type { LibraryRepo } from "@/services/github/library";
import { deleteSong } from "@/services/songsService";
import { removeRemoteTrack } from "./remove";

// True when the song has a copy in one of the user's GitHub libraries.
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

// Deletes here, then right away in the library that holds the song. If
// GitHub cannot be reached the sync record stays, so the next full sync
// finishes the delete.
export async function deleteEverywhere(
  trackId: string,
  libraries: LibraryRepo[] | undefined,
): Promise<DeleteResult> {
  const record = await db.syncState.get(trackId);
  await deleteSong(trackId);
  await dropQueued(trackId);
  await db.syncState.update(trackId, { deviceRemoved: false });

  const library = libraries?.find((l) => l.repo === record?.library);
  if (!record || !library) return "queued";

  try {
    await removeRemoteTrack(library, trackId);
  } catch {
    return "queued";
  }
  await db.syncState.delete(trackId);
  await db.outbox.delete(`delete-remote:${trackId}`);
  return "deleted";
}
