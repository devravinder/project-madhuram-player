import { FAVOURITE_PLAYLIST_ID, RECENT_PLAYLIST_ID } from "@/constants";
import { usePlaylists } from "@/context/PlaylistContext";
import { useSync } from "@/context/SyncContext";
import { getPlaylists, updatePlaylist } from "@/services/playlistService";
import { confirmToast } from "@/services/confirmToast";
import { deleteSong, getSong } from "@/services/songsService";
import { isBackedUp, removeFromDeviceOnly } from "@/services/sync/deleteTrack";
import type { Playlist } from "@/types/music";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ListMusic, ListPlus, MoreVertical, Trash } from "lucide-react";
import { useEffect, useState, type MouseEventHandler } from "react";
import { toast } from "sonner";
import DeleteSongDialog, { type DeleteChoice } from "./DeleteSongDialog";
import { useSongsList } from "./SongListContext";

const SongActions = ({
  id,
  isCurrent,
}: {
  id: string;
  isCurrent: boolean;
}) => {
  const { refetch } = useSongsList();
  const { setFavourites } = usePlaylists();
  const { signedIn, deleteEverywhere } = useSync();
  const [asking, setAsking] = useState<string>(); // title of the song asked about

  const afterDelete = (fromPlaylists: boolean) => {
    if (fromPlaylists) setFavourites((pre) => pre.filter((i) => i !== id));
    refetch();
  };

  const handleDelete: MouseEventHandler<HTMLDivElement> = async (e) => {
    e.stopPropagation();

    if (isCurrent) {
      toast.error("This song is currently playing, so it cannot be deleted");
      return;
    }

    const backedUp = await isBackedUp(id);

    const title = (await getSong(id))?.title ?? "this song";

    if (backedUp && signedIn) {
      setAsking(title);
      return;
    }

    if (backedUp) {
      // Signed out: the GitHub copy is kept, so signing in later does not delete it.
      const yes = await confirmToast({
        title: `Remove “${title}” from this device?`,
        description: "Its copy on GitHub is kept. Download brings it back.",
        confirmLabel: "Remove",
        destructive: true,
      });
      if (!yes) return;
      await removeFromDeviceOnly(id);
      afterDelete(false);
      return;
    }

    const yes = await confirmToast({
      title: `Delete “${title}”?`,
      description: "It is removed from this device.",
      confirmLabel: "Delete",
      destructive: true,
    });

    if (yes) {
      await deleteSong(id);
      afterDelete(true);
    }
  };

  const choose = async (choice: DeleteChoice) => {
    setAsking(undefined);
    if (choice === "device") {
      await removeFromDeviceOnly(id);
      afterDelete(false);
      toast.success("Removed from this device. It is still on GitHub.");
      return;
    }
    const pending = deleteEverywhere(id);
    toast.promise(pending, {
      loading: "Deleting from GitHub…",
      success: (result) =>
        result === "deleted"
          ? "Deleted everywhere"
          : "Deleted here. GitHub will be updated on the next sync.",
      error: "Could not delete the song",
    });
    await pending.catch(() => undefined);
    afterDelete(true);
  };

  return (
    <>
    {asking !== undefined && (
      <DeleteSongDialog
        title={asking}
        onChoose={choose}
        onClose={() => setAsking(undefined)}
      />
    )}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <MoreVertical />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="relative glass flex flex-col gap-2 px-4 py-2 mr-8 mt-2 rounded-lg w-52"
          sideOffset={5}
        >
          <DropdownMenu.Item
            onClick={handleDelete}
            className="outline-none text-muted-foreground flex flex-row items-center gap-2 px-4 py-2 rounded-md hover:bg-secondary/50 cursor-pointer transition-all duration-200 "
          >
            <Trash size={20} /> Delete
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="outline-none "
            onClick={(e) => e.stopPropagation()}
          >
            <PlaylistMenu id={id} />
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    </>
  );
};

const PlaylistMenu = ({ id }: { id: string }) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  const toggleSong = async (playlist: Playlist) => {
    const songIds = playlist.songIds.includes(id)
      ? playlist.songIds.filter((i) => i !== id)
      : [...playlist.songIds, id];
    const updated = { ...playlist, songIds };

    setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? updated : p)));

    await updatePlaylist(playlist.id, updated);
  };

  useEffect(() => {
    const fetchPlaylists = async () => {
      const res = await getPlaylists();
      setPlaylists(
        res.filter(
          (i) => i.id !== FAVOURITE_PLAYLIST_ID && i.id !== RECENT_PLAYLIST_ID,
        ),
      );
    };

    fetchPlaylists();
  }, []);

  return (
    <DropdownMenu.Root>
      {playlists.length > 0 && (
        <DropdownMenu.Trigger className="outline-none text-muted-foreground flex flex-row items-center gap-2 px-4 py-2 rounded-md hover:bg-secondary/50 cursor-pointer transition-all duration-200 ">
          <ListPlus size={20} /> Add to playlist
        </DropdownMenu.Trigger>
      )}

      <DropdownMenu.Portal>
        <DropdownMenu.Content className="glass flex flex-col gap-2 px-4 py-2 mr-8  mt-4 rounded-lg w-52 z-50">
          {playlists.map((p) => (
            <DropdownMenu.Item
              key={p.id}
              onClick={() => {
                toggleSong(p);
              }}
              className="outline-none text-muted-foreground flex flex-row items-center justify-between gap-2 px-4 py-2 rounded-md hover:bg-secondary/50 cursor-pointer transition-all duration-200 "
            >
              <span className="flex flex-row gap-2 items-center">
                <ListMusic size={20} />
                {p.name}
              </span>
              {p.songIds.includes(id) && <Check size={20} />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default SongActions;
