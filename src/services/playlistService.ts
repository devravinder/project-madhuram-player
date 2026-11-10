import type { Playlist } from "@/types/music";
import db, { COLLECTIONS } from "./db";
import { getId } from "./util";

export const createPlaylist = async (
  playlist: Omit<Playlist, "id" | "createdAt" | "updatedAt">,
  id?: string
): Promise<Playlist> => {
  const newPlaylist: Playlist = {
    ...playlist,
    id: id || getId(36),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.playlists.add(newPlaylist);
  return newPlaylist;
};
export const getPlaylist = (id: string) => db.playlists.get(id);
export const getPlaylists = () => db.playlists.toArray();

export const updatePlaylist = async (
  id: string,
  updates: Partial<Omit<Playlist, "id" | "createdAt">>
) => {
  await db.playlists.update(id, {
    ...updates,
    updatedAt: new Date(),
  });
};

// The tombstone lets sync tell "deleted here" from "never existed here".
export const deletePlaylist = async (id: string) => {
  await db.transaction("rw", db.playlists, db.playlistTombstones, async () => {
    await db.playlists.delete(id);
    await db.playlistTombstones.put({ id, deletedAt: new Date() });
  });
};

export const resetPlaylists = async (playlists: Playlist[]) => {
  await db[COLLECTIONS.PLAYLIST_COLLECTION].clear();

  await db[COLLECTIONS.PLAYLIST_COLLECTION].bulkAdd(playlists);
};
