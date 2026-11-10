import { FAVOURITE_PLAYLIST_ID, RECENT_PLAYLIST_ID } from "@/constants";
import { Clock, Heart, ListMusic } from "lucide-react";

export default function PlayListIcon({ id }: { id?: string }) {
  const Icon =
    id === RECENT_PLAYLIST_ID
      ? Clock
      : id === FAVOURITE_PLAYLIST_ID
      ? Heart
      : ListMusic;

  return <Icon size={30} />;
}
