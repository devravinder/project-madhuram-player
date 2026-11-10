import db from "@/services/db";
import { useLiveQuery } from "dexie-react-hooks";

// Content hashes of tracks already saved on this device.
export function useSavedHashes(): Set<string> {
  const songs = useLiveQuery(() => db.songs.toArray(), []);
  return new Set(songs?.flatMap((song) => (song.sha256 ? [song.sha256] : [])));
}