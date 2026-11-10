import { PlaylistModal } from "@/components/PlaylistModal";
import db from "@/services/db";
import { useNavigate } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/playlists/edit/$id")({
  component: RouteComponent,
  loader: async ({ params: { id } }) => db.playlists.get(id),
});

function RouteComponent() {
  const navigate = useNavigate();
  const playlist = Route.useLoaderData();

  if (!playlist) return undefined;

  return (
    <PlaylistModal
      title="Edit Plalist"
      onClose={() =>
        navigate({ to: "/playlists/$id", params: { id: playlist.id } })
      }
      playlist={playlist}
    />
  );
}
