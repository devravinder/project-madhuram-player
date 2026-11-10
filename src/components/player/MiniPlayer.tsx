import { usePlayer } from "@/context/PlayerContext";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { ProgressBar } from "./ProgressBar";
import AudioImage from "../AudioImage";

export default function MiniPlayer({ onClick }: { onClick?: VoidFunction }) {
  const {
    currentSong,
    isPlaying,
    progress,
    duration,
    togglePlay,
    next,
    previous,
    seek,
  } = usePlayer();

  if (!currentSong) {
    return undefined;
  }

  return (
    <div className="shrink-0 glass">
      <div className="px-4 pt-2">
        <ProgressBar progress={progress} duration={duration} onSeek={seek} />
      </div>
      <div className="flex flex-row justify-between gap-3 p-3">
        <div
          onClick={onClick}
          className="flex flex-row grow items-center gap-3 cursor-pointer"
        >
          <AudioImage id={currentSong.coverImageId} alt={currentSong.title} className="h-12 w-12" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm line-clamp-1">
              {currentSong.title}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-1">
              {currentSong.artist}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={previous}
            className="p-2 cursor-pointer rounded-full hover:bg-accent"
          >
            <SkipBack size={20} />
          </button>
          <button
            onClick={togglePlay}
            className="rounded-full cursor-pointer bg-muted p-3"
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button
            onClick={next}
            className="p-2 cursor-pointer rounded-full hover:bg-accent"
          >
            <SkipForward size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
