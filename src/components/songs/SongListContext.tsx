import type { Song } from "@/types/music";
import { createContext, useContext } from "react";
import SongsList from "./SongsList";

interface SongListContextType {
  songs: Song[];
  showSearchBar?: boolean;
  playListId: string;
  refetch: VoidFunction;
}

const SongListContext = createContext<SongListContextType | undefined>(
  undefined,
);

export const SongListProvider = (props: SongListContextType) => {
  return (
    <SongListContext.Provider value={props}>
      <SongsList />
    </SongListContext.Provider>
  );
};

export function useSongsList() {
  const context = useContext(SongListContext);
  if (context === undefined) {
    throw new Error(
      "useSongsList must be used within a SongListContextProvider",
    );
  }
  return context;
}
