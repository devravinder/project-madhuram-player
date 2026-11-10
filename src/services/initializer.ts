import type { Playlist } from "@/types/music";
import db, { initDB } from "./db";
import { FAVOURITE_PLAYLIST_ID, RECENT_PLAYLIST_ID } from "../constants";

//====
export const createSampleSongs = async () => {
  console.log("createSampleSongs");
  // await db.songs.bulkAdd(staticSongs);
};

// Starts at the epoch, so an untouched default never beats a real playlist in sync.
const recentPlaylistDefault: Playlist = {
  id: RECENT_PLAYLIST_ID,
  name: "Recently Played",
  description: "recently played songs",
  songIds: [],
  createdAt: new Date(),
  updatedAt: new Date(0),
};

const favouritePlaylistDefault: Playlist = {
  id: FAVOURITE_PLAYLIST_ID,
  name: "Favourites",
  description: "Favourite songs",
  songIds: [],
  createdAt: new Date(),
  updatedAt: new Date(0),
};

export const createInitialPlayLists = async () => {
  console.log("createInitialPlayLists");
  await db.playlists.add(recentPlaylistDefault);
  await db.playlists.add(favouritePlaylistDefault);
};

export const onAppStart = async () => {
  await initDB();

  const data = await db.playlists.get(FAVOURITE_PLAYLIST_ID);

  if (data) {
    console.log("Data already exists");
    return;
  }

  await createSampleSongs();
  await createInitialPlayLists();
};
