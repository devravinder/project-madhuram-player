import { FAVOURITE_PLAYLIST_ID, RECENT_PLAYLIST_ID } from "@/constants";
import { usePlaylists } from "@/context/PlaylistContext";
import { getPlaylists, updatePlaylist } from "@/services/playlistService";
import { deleteSong } from "@/services/songsService";
import type { Playlist } from "@/types/music";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ListMusic, ListPlus, MoreVertical, Trash } from "lucide-react";
import { useEffect, useState, type MouseEventHandler } from "react";
import { useSongsList } from "./SongListContext";

const SongActions = ({
  id,
  allowDelete,
}: {
  id: string;
  allowDelete: boolean;
}) => {
  const { refetch } = useSongsList();
  const { setFavourites } = usePlaylists();
  const handleDelete: MouseEventHandler<HTMLDivElement> = async (e) => {
    e.stopPropagation();

    if (!allowDelete) return;

    const yes = window.confirm("Really want to delete");

    if (yes) {
      await deleteSong(id);
      setFavourites((pre) => pre.filter((i) => i !== id));
      refetch();
    }
  };

  return (
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
            role="button"
            onClick={handleDelete}
            disabled={!allowDelete}
            className="disabled:cursor-not-allowed outline-none text-muted-foreground flex flex-row items-center gap-2 px-4 py-2 rounded-md hover:bg-secondary/50 cursor-pointer transition-all duration-200 "
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
