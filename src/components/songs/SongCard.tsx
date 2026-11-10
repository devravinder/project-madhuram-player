import { usePlayer } from "@/context/PlayerContext";
import { formatTime } from "@/services/timeUtil";
import type { Song } from "@/types/music";
import { Pause, Play } from "lucide-react";
import AudioImage from "../AudioImage";
import { SongItem } from "../Elements";
import Waves from "../Waves";
import SongActions from "./SongActions";
import { useSongsList } from "./SongListContext";

interface SongCardProps {
  song: Song;
  queue: Song[];
  index: number;
}

export default function SongCard({ song, queue, index }: SongCardProps) {
  const { playListId } = useSongsList();
  const { currentSong, isPlaying, playSong, togglePlay } = usePlayer();
  const isCurrentSong = currentSong?.id === song.id;

  const handleClick = () => {
    if (isCurrentSong) {
      togglePlay();
    } else {
      playSong(queue, index, playListId);
    }
  };

  return (
    <SongItem onClick={handleClick} active={isCurrentSong}>
      <span className="w-6 text-center text-sm text-muted-foreground">
        {index !== undefined ? index + 1 : ""}
      </span>

      <div className="w-12 h-12 relative">
        <AudioImage id={song.coverImageId} alt={song.title} />
        <div className="absolute border p-2 rounded-lg inset-0 flex justify-center items-center group-hover:hidden">
          {isCurrentSong && <Waves start={isPlaying} />}
        </div>
        <div className="absolute border p-2 rounded-lg inset-0 justify-center items-center hidden group-hover:flex">
          {isCurrentSong && isPlaying ? <Pause /> : <Play />}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={`font-medium line-clamp-1 ${
            isCurrentSong ? "text-emerald-300" : "text-foreground"
          }`}
        >
          {song.title}
        </p>
        <p className="text-sm text-muted-foreground line-clamp-1">
          {song.artist}
        </p>
      </div>

      <span className="text-sm text-muted-foreground hidden sm:block">
        {song.album}
      </span>

      <span className="text-sm text-muted-foreground w-12 text-right">
        {formatTime(song.duration)}
      </span>
      <div className="grop py-2 px-1 cursor-pointer text-muted-foreground rounded-lg justify-center items-center">
        <SongActions isCurrent={isCurrentSong} id={song.id} />
      </div>
    </SongItem>
  );
}
