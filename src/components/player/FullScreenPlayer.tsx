import { usePlayer } from "@/context/PlayerContext";
import { formatTime } from "@/services/timeUtil";
import {
  CircleEllipsis,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useState } from "react";
import { Like } from "../Elements";
import { ProgressBar } from "./ProgressBar";
import SleeperTimer from "./SleeperTimer";
import { VolumeSlider } from "./VolumeSlider";
import Waves from "../Waves";
import { usePlaylists } from "@/context/PlaylistContext";
import AudioImage from "../AudioImage";
import { VideoSurface } from "./VideoSurface";

export default function FullScreenPlayer({
  onClose,
}: {
  onClose?: VoidFunction;
}) {
  const {favourites, toggleLike } = usePlaylists()
  const [showMenu, setShowMenu] = useState(false);

  const {
    currentSong: song,
    isPlaying,
    progress,
    duration,
    shuffle,
    repeatMode,
    volume,
    setVolume,
    toggleRepeat,
    toggleShuffle,
    togglePlay,
    next,
    previous,
    seek,
  } = usePlayer();

  if (!song) {
    return undefined;
  }

  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;
  const isLiked = favourites.includes(song?.id);

  return (
    <div className="w-full max-w-md mx-auto h-full p-4 flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col bg-linear-to-br from-slate-900 to-slate-800 rounded-3xl shadow-2xl">
        <div className="flex justify-center items-center relative">
          {song.kind === "video" ? (
            <VideoSurface className="w-full aspect-video rounded-t-3xl overflow-hidden" />
          ) : (
            <AudioImage id={song.coverImageId} alt={song.title} className="w-full aspect-square rounded-t-3xl object-cover" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-slate-900/90 via-transparent to-transparent" />
          <button
            onClick={() => toggleLike(song.id)}
            className="absolute top-4 right-4 p-2.5 bg-black/30 backdrop-blur-sm rounded-full hover:bg-black/50 transition-all"
          >
            <Like liked={isLiked} />
          </button>
        </div>
        <div className="flex items-center justify-center px-4 py-4">
          <div className="w-full flex flex-col gap-4">
            <div className="flex flex-row w-full gap-2 items-center justify-between">
              <div className="flex flex-col gap-2">
                <p className="font-medium text-sm line-clamp-1 text-ellipsis">
                  {song.title}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-1 text-ellipsis">
                  {song.artist}
                </p>
              </div>
              <div className="h-10 w-10">
                <Waves start={isPlaying} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={onClose}
                  className={`cursor-pointer p-2 rounded-lg bg-accent text-muted-foreground`}
                >
                  <ListMusic className="h-5 w-5" />
                </button>
                <div
                  onClick={() => setShowMenu(true)}
                  className={`group relative cursor-pointer p-2 rounded-lg bg-accent text-muted-foreground`}
                >
                  <CircleEllipsis className="w-5 h-5" />
                  {showMenu && (
                    <div className="absolute bottom-full right-1/2 -translate-y-2">
                      <SleeperTimer onClose={() => setShowMenu(false)} />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <ProgressBar
                progress={progress}
                duration={duration}
                onSeek={seek}
              />
              <div className="flex flex-row justify-between items-center gap-2">
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {formatTime(progress)}
                </span>
                <span className="text-xs text-muted-foreground w-10">
                  {formatTime(duration)}
                </span>
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <div className="w-full max-w-sm mx-auto space-y-2 px-4">
                <div className="grid grid-cols-4 justify-items-center sm:gap-2 gap-8">
                  <div className=" col-span-1">
                    <button
                      onClick={() => seek(progress - 15)}
                      className="cursor-pointer p-2 rounded-full hover:bg-accent relative flex items-center justify-center"
                    >
                      <RotateCcw className="h-7 w-7 text-muted-foreground font-thin stroke-1" />
                      <span className="absolute leading-none text-muted-foreground text-xs top-1/2 -translate-y-1/2">
                        15
                      </span>
                    </button>
                  </div>
                  <div className="col-span-2 w-full flex flex-row items-center justify-center gap-1">
                    <button
                      onClick={previous}
                      className="p-2 cursor-pointer rounded-full hover:bg-accent"
                    >
                      <SkipBack className="h-6 w-6" />
                    </button>
                    <button
                      onClick={togglePlay}
                      className="rounded-full cursor-pointer bg-muted p-3"
                    >
                      {isPlaying ? (
                        <Pause className="h-6 w-6" />
                      ) : (
                        <Play className="h-6 w-6" />
                      )}
                    </button>
                    <button
                      onClick={next}
                      className="p-2 cursor-pointer rounded-full hover:bg-accent"
                    >
                      <SkipForward className="h-6 w-6" />
                    </button>
                  </div>
                  <div className=" col-span-1">
                    <button
                      onClick={() => seek(progress + 15)}
                      className="cursor-pointer p-2 rounded-full hover:bg-accent relative flex items-center justify-center"
                    >
                      <RotateCw className="h-7 w-7 text-muted-foreground font-thin stroke-1" />
                      <span className="absolute leading-none text-muted-foreground text-xs top-1/2 -translate-y-1/2">
                        15
                      </span>
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-4 justify-items-center sm:gap-2 gap-8">
                  <div className="col-span-1">
                    <button
                      onClick={toggleShuffle}
                      className={`p-2 cursor-pointer rounded-full hover:bg-accent ${
                        shuffle ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      <Shuffle className="h-6 w-6" />
                    </button>
                  </div>
                  <div className="col-span-2 flex w-full justify-center">
                    <VolumeSlider volume={volume} onVolumeChange={setVolume} />
                  </div>
                  <div className="col-span-1">
                    <button
                      onClick={toggleRepeat}
                      className={`p-2 cursor-pointer rounded-full hover:bg-accent ${
                        repeatMode !== "off"
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      <RepeatIcon className="h-6 w-6" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
