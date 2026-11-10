import {
  DEFAULT_PLAYLIST,
  FAVOURITE_PLAYLIST_ID,
  RECENT_PLAYLIST_ID,
  RECENT_PLAYLIST_LIMIT,
} from "@/constants";
import { getPlaylist, updatePlaylist } from "@/services/playlistService";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
interface PlaylistContextType {
  addToRecentlyPlayed: (songId: string, playListId?: string) => Promise<void>;
  toggleLike: (songId: string) => void;
  favourites: string[];
  setFavourites: React.Dispatch<React.SetStateAction<string[]>>
}

const PlaylistContext = createContext<PlaylistContextType | undefined>(
  undefined
);

export function PlaylistProvider({ children }: { children: React.ReactNode }) {
  const [favourites, setFavourites] = useState<string[]>([]);
  const currentPlaylistId = useRef(DEFAULT_PLAYLIST);

  const addToRecentlyPlayed = async (
    songId: string,
    songPlayListId?: string
  ) => {
    const playlistId = songPlayListId || currentPlaylistId.current;
    currentPlaylistId.current = playlistId;

    //=====

    const isRecent = playlistId === RECENT_PLAYLIST_ID;

    if (isRecent) return;

    const recentPlaylist = await getPlaylist(RECENT_PLAYLIST_ID);

    const previous =
      recentPlaylist?.songIds.filter((ele) => ele !== songId) || [];

    const songIds = [songId, ...previous].slice(0, RECENT_PLAYLIST_LIMIT);

    await updatePlaylist(RECENT_PLAYLIST_ID, {
      songIds,
    });
  };

  const toggleLike = useCallback(
    async (songId: string) => {
      const favouritePlaylist = await getPlaylist(FAVOURITE_PLAYLIST_ID);
      const favourites = favouritePlaylist?.songIds || [];
      const songIds = favourites.includes(songId)
        ? favourites.filter((id) => id !== songId)
        : [songId, ...favourites];

      setFavourites(songIds);

      await updatePlaylist(FAVOURITE_PLAYLIST_ID, { songIds });
    },
    [setFavourites]
  );

  useEffect(() => {
    const syncData = async () => {
      const favouritePlaylist = await getPlaylist(FAVOURITE_PLAYLIST_ID);
      if (favouritePlaylist && favouritePlaylist.songIds)
        setFavourites(favouritePlaylist?.songIds);
    };
    syncData();
  }, []);

  return (
    <PlaylistContext.Provider
      value={{
        favourites,
        setFavourites,
        addToRecentlyPlayed,
        toggleLike,
      }}
    >
      {children}
    </PlaylistContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlaylists() {
  const context = useContext(PlaylistContext);
  if (context === undefined) {
    throw new Error("usePlaylists must be used within a PlaylistProvider");
  }
  return context;
}
