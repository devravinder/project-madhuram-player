import type { Playlist, Song } from "@/types/music";
import db, { COLLECTIONS } from "./db";
import { deleteFile } from "./filesService";
import { getPlaylists, updatePlaylist } from "./playlistService";
import { getId } from "./util";

export const getSongs = () => db.songs.toArray();

export const getSong = (id: string) => db.songs.get(id);
export const getSongsCount = () => db.songs.count();

export const getPlayListSongs = async (playlist?: Playlist) => {
  if (!playlist) return [];
  const allSongs = await getSongs();
  return allSongs.filter((song) => playlist.songIds.includes(song.id));
};

export const addSong = async (song: Omit<Song, "id">, id?: string) => {
  const newSong: Song = {
    ...song,
    id: id || `${getId()}`,
    addedAt: new Date(),
  };
  await db.songs.add(newSong);

  return newSong;
};
export const deleteSongs = async () => {
  await db.songs.clear();
};

export const deleteSong = async (id: string) => {
  const song = await getSong(id);
  if (!song) return;

  await deleteFile(song.audioId);

  if (song.coverImageId) await deleteFile(song.coverImageId);

  await db[COLLECTIONS.SONGS_COLLECTION].delete(id);

  const playlists = await getPlaylists();

  for (const playlist of playlists) {
    if (playlist.songIds.includes(id)) {
      playlist.songIds = playlist.songIds.filter((i) => i !== id);

      await updatePlaylist(playlist.id, playlist);
    }
  }
};

export const resetSongs = async (songs: Song[]) => {
  await db[COLLECTIONS.SONGS_COLLECTION].clear();

  await db[COLLECTIONS.SONGS_COLLECTION].bulkAdd(songs);
};
