import { usePlayer } from "@/context/PlayerContext";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import AudioImage from "../AudioImage";

// A slim bar above the navigation; tapping the song opens the full player.
export default function MiniPlayer({ onClick }: { onClick?: VoidFunction }) {
  const { currentSong, isPlaying, progress, duration, togglePlay, next, previous } =
    usePlayer();

  if (!currentSong) {
    return undefined;
  }

  const percentage = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="shrink-0 glass relative">
      {/* Progress only; seeking happens in the full player. */}
      <div aria-hidden className="absolute top-0 inset-x-0 h-0.5 bg-muted">
        <div className="h-full bg-highlight" style={{ width: `${percentage}%` }} />
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onClick}
          aria-label={`Open player: ${currentSong.title}`}
          className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer text-left"
        >
          <AudioImage
            id={currentSong.coverImageId}
            src={currentSong.coverUrl}
            alt=""
            className="size-10 shrink-0 rounded-md"
          />
          <span className="flex-1 min-w-0">
            <span className="block font-medium text-sm truncate">{currentSong.title}</span>
            <span className="block text-xs text-muted-foreground truncate">
              {currentSong.artist}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label="Previous"
            onClick={previous}
            className="p-2 cursor-pointer rounded-full hover:bg-accent"
          >
            <SkipBack size={20} />
          </button>
          <button
            type="button"
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={togglePlay}
            className="rounded-full cursor-pointer bg-muted p-2.5"
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button
            type="button"
            aria-label="Next"
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
