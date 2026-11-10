import { PlaylistModal } from "@/components/PlaylistModal";
import type { Playlist } from "@/types/music";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/playlists/create")({
  component: RouteComponent,
});
const newPlaylist = (): Omit<Playlist, "createdAt" | "updatedAt"> => ({
  id: "",
  name: "",
  description: "",
  songIds: [],
});

function RouteComponent() {
  const navigate = useNavigate();
  return (
    <PlaylistModal
      title="Create Plalist"
      onClose={() => navigate({ to: "/playlists" })}
      playlist={newPlaylist()}
    />
  );
}
