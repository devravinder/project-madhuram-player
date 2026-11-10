import {
  createPlaylist,
  deletePlaylist,
  updatePlaylist,
} from "@/services/playlistService";
import type { Playlist } from "@/types/music";
import { useNavigate } from "@tanstack/react-router";
import { Check, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Input, Textarea } from "./Elements";
import Modal from "./Modal";
import db from "@/services/db";
import { FAVOURITE_PLAYLIST_ID } from "@/constants";

import { useLiveQuery } from "dexie-react-hooks";
import { usePlaylists } from "@/context/PlaylistContext";
import AudioImage from "./AudioImage";

interface PlaylistModalProps {
  title: string;
  playlist: Omit<Playlist, "createdAt" | "updatedAt">;
  onClose: () => void;
}

export function PlaylistModal({
  title,
  playlist,
  onClose,
}: PlaylistModalProps) {
  const allSongs = useLiveQuery(() => db.songs.toArray());
  const { setFavourites } = usePlaylists();

  const navigate = useNavigate();

  const isEditing = playlist.id;
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description || "");
  const [selectedSongs, setSelectedSongs] = useState<Set<string>>(
    new Set(playlist.songIds)
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(playlist.name);
    setDescription(playlist.description || "");
    setSelectedSongs(new Set(playlist.songIds));
  }, [playlist]);

  const handleSave = () => {
    const songIds = [...selectedSongs];
    if (playlist.id) {
      updatePlaylist(playlist.id, {
        name,
        description: description || undefined,
        songIds,
      });
      if (playlist.id === FAVOURITE_PLAYLIST_ID) setFavourites(songIds);
    } else {
      createPlaylist({
        name,
        description,
        songIds,
      });
    }

    onClose();
  };

  const onDelete = () => {
    if (isEditing) {
      deletePlaylist(playlist.id);
      onClose();
      navigate({ to: "/playlists" });
    }
  };

  const toggleSong = (songId: string) => {
    setSelectedSongs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(songId)) {
        newSet.delete(songId);
      } else {
        newSet.add(songId);
      }
      return newSet;
    });
  };

  return (
    <Modal>
      <div className="w-full max-w-md mx-auto h-full p-8 flex flex-col">
        <div
          className="relative py-4 flex-1 min-h-0 flex flex-col gap-4 bg-linear-to-br from-slate-900 to-slate-800 rounded-3xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-8 py-4 flex items-center justify-between ">
            <h2 className="text-xl font-bold">{title}</h2>
            <button
              onClick={onClose}
              className="cursor-pointer absolute top-8 right-8 p-2.5 bg-black/30 backdrop-blur-sm rounded-full hover:bg-black/50 transition-all"
            >
              <X size={20} />
            </button>
          </div>

          <div className="px-8 space-y-4 flex-1 overflow-y-auto">
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <Input
                type="text"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setName(e.target.value)
                }
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Description
              </label>
              <Textarea
                value={description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setDescription(e.target.value)
                }
                className="input-field resize-none h-16"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Select Songs
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-xl p-2">
                {(allSongs || []).map((song) => (
                  <button
                    key={song.id}
                    onClick={() => toggleSong(song.id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                      selectedSongs.has(song.id)
                        ? "bg-primary/20 text-primary"
                        : "hover:bg-secondary"
                    }`}
                  >
                    <AudioImage id={song.coverImageId} alt={song.title} className="w-10 h-10 rounded"/>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium truncate">
                        {song.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {song.artist}
                      </p>
                    </div>
                    {selectedSongs.has(song.id) && (
                      <Check size={18} className="text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-8 pt-4 flex flex-row justify-between border-t border-border">
            {isEditing && (
              <button
                onClick={onDelete}
                className="cursor-pointer p-2 px-4 rounded-lg text-destructive hover:text-primary hover:bg-accent/70 flex items-center gap-2"
              >
                <Trash2 size={18} />
                Delete
              </button>
            )}
            <div className="flex-1 flex flex-row justify-end gap-4">
              <button
                onClick={onClose}
                className="cursor-pointer p-2 px-4 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="cursor-pointer p-2 px-4 rounded-lg bg-primary hover:bg-primary/90 text-secondary"
                disabled={!name.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
