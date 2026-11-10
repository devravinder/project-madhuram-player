import { usePlayer } from "@/context/PlayerContext";
import { usePlaylists } from "@/context/PlaylistContext";
import { formatTime } from "@/services/timeUtil";
import {
  ChevronDown,
  Ellipsis,
  Gauge,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Timer,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import AudioImage from "../AudioImage";
import { Like } from "../Elements";
import MediaOverlay from "./MediaOverlay";
import { ProgressBar } from "./ProgressBar";
import SleeperTimer from "./SleeperTimer";
import { useVideoActions, VideoSurface } from "./VideoSurface";
import { VolumeSlider } from "./VolumeSlider";

// A round, labelled button for the player; `active` marks a mode that is on.
function PlayerButton({
  label,
  active,
  className = "",
  ...props
}: ComponentProps<"button"> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`cursor-pointer shrink-0 grid place-items-center rounded-full size-10 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-primary transition-colors ${
        active === undefined ? "" : active ? "text-highlight" : "text-white/60"
      } ${className}`}
      {...props}
    />
  );
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

// Playback speed, like a video site: the current value, and a grid to pick another.
function SpeedPicker({ speed, setSpeed }: { speed: number; setSpeed: (speed: number) => void }) {
  const [open, setOpen] = useState(false);
  const label = speed === 1 ? "Normal" : `${speed}×`;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`cursor-pointer flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 ${
          speed === 1 ? "" : "text-highlight"
        }`}
      >
        <Gauge className="size-5" />
        <span className="flex-1 text-left">Speed</span>
        <span className="text-sm text-white/70">{label}</span>
      </button>
      {open && (
        <div role="radiogroup" aria-label="Playback speed" className="grid grid-cols-5 gap-1">
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={value === speed}
              onClick={() => {
                setSpeed(value);
                setOpen(false);
              }}
              className={`cursor-pointer py-1.5 rounded-md text-sm tabular-nums ${
                value === speed ? "bg-highlight text-slate-900 font-semibold" : "bg-white/5 hover:bg-white/15"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Secondary controls, in a small panel above the "More options" button.
function MoreControls(props: {
  onClose: VoidFunction;
  shuffle: boolean;
  toggleShuffle: VoidFunction;
  repeatIcon: ReactNode;
  repeatLabel: string;
  repeatOn: boolean;
  toggleRepeat: VoidFunction;
  volume: number;
  setVolume: (volume: number) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  sleepOn: boolean;
}) {
  const [timer, setTimer] = useState(false);

  return (
    <>
      {/* Tapping anywhere else closes the panel. */}
      <button
        type="button"
        aria-label="Close options"
        tabIndex={-1}
        className="fixed inset-0 z-10 cursor-default"
        onClick={props.onClose}
      />
      <div
        role="dialog"
        aria-label="More options"
        className="absolute bottom-full right-0 mb-2 z-20 max-w-[calc(100vw-2rem)]"
      >
        {timer ? (
          <div className="text-foreground">
            <SleeperTimer onClose={props.onClose} />
          </div>
        ) : (
          <div className="w-64 flex flex-col gap-2 p-3 rounded-2xl bg-slate-800 shadow-2xl ring-1 ring-white/10">
            <div className="flex items-center justify-between">
              <PlayerButton
                label="Shuffle"
                aria-pressed={props.shuffle}
                active={props.shuffle}
                onClick={props.toggleShuffle}
              >
                <Shuffle className="size-5" />
              </PlayerButton>
              <PlayerButton
                label={props.repeatLabel}
                aria-pressed={props.repeatOn}
                active={props.repeatOn}
                onClick={props.toggleRepeat}
              >
                {props.repeatIcon}
              </PlayerButton>
            </div>
            <VolumeSlider volume={props.volume} onVolumeChange={props.setVolume} />
            <SpeedPicker speed={props.speed} setSpeed={props.setSpeed} />
            <button
              type="button"
              onClick={() => setTimer(true)}
              className={`cursor-pointer flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 ${
                props.sleepOn ? "text-highlight" : ""
              }`}
            >
              <Timer className="size-5" />
              {props.sleepOn ? "Sleep timer is on" : "Sleep timer"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// The open player: the cover or video filling the free space, with tap
// controls over it, and the main controls kept compact at the bottom. On
// short landscape screens the media and the controls sit side by side.
export default function FullScreenPlayer({ onClose }: { onClose: VoidFunction }) {
  const { favourites, toggleLike } = usePlaylists();
  const [showMenu, setShowMenu] = useState(false);
  const videoHost = useRef<HTMLDivElement>(null);
  const video = useVideoActions(videoHost);

  const {
    currentSong: song,
    isPlaying,
    progress,
    duration,
    shuffle,
    repeatMode,
    volume,
    setVolume,
    speed,
    setSpeed,
    sleepTimer,
    toggleRepeat,
    toggleShuffle,
    togglePlay,
    next,
    previous,
    seek,
  } = usePlayer();

  // Escape minimizes, unless the sleep timer menu is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showMenu) setShowMenu(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMenu, onClose]);

  if (!song) return undefined;

  const isVideo = song.kind === "video";
  const isLiked = favourites.includes(song.id);
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;
  const repeatLabel =
    repeatMode === "one" ? "Repeat one" : repeatMode === "all" ? "Repeat all" : "Repeat off";

  let media: ReactNode;
  const seekBy = (seconds: number) =>
    seek(Math.min(duration, Math.max(0, progress + seconds)));
  const overlay = (
    <MediaOverlay
      isPlaying={isPlaying}
      togglePlay={togglePlay}
      seekBy={seekBy}
      video={isVideo ? video : undefined}
      className="rounded-2xl"
    />
  );
  if (isVideo) {
    // The overlay sits beside the video host, so fullscreen shows only the video.
    media = (
      <div className="relative size-full">
        <VideoSurface hostRef={videoHost} className="size-full" />
        {overlay}
      </div>
    );
  } else {
    // The cover stays square and as large as the free space allows.
    media = (
      <div className="size-full grid place-items-center [container-type:size]">
        <div className="relative w-[min(100cqw,100cqh)] aspect-square rounded-2xl shadow-2xl">
          <AudioImage
            id={song.coverImageId}
            src={song.coverUrl}
            alt={song.title}
            className="size-full object-cover rounded-2xl"
          />
          {overlay}
        </div>
      </div>
    );
  }

  // The open player is always dark, so it keeps the light green accent.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Now playing: ${song.title}`}
      className="fixed inset-0 z-50 h-dvh flex flex-col overflow-hidden text-white bg-linear-to-b from-slate-800 to-slate-950 pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),0.5rem)] [--highlight:oklch(0.845_0.143_164.978)]"
    >
      <div
        className={`mx-auto w-full h-full min-h-0 flex flex-col ${
          isVideo ? "max-w-5xl" : "max-w-lg short:max-w-4xl"
        }`}
      >
        {/* Fullscreen and picture-in-picture now sit on the video itself. */}
        <div className="shrink-0 h-4" />

        <div className="flex-1 min-h-0 flex flex-col short:flex-row gap-4 px-4 pb-4">
          <div className="flex-1 min-h-0 min-w-0">{media}</div>

          <section
            aria-label="Playback controls"
            className="shrink-0 flex flex-col gap-2 short:w-[45%] short:justify-center"
          >
            {/* Minimize sits by the thumb, at the right of the title. */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{song.title}</p>
                <p className="text-sm text-white/60 truncate">{song.artist}</p>
              </div>
              <PlayerButton label="Minimize player" onClick={onClose} className="-mr-2">
                <ChevronDown className="size-6" />
              </PlayerButton>
            </div>

            <div className="flex items-center gap-2 text-xs text-white/60 tabular-nums">
              <span className="w-10 text-right">{formatTime(progress)}</span>
              <ProgressBar
                progress={progress}
                duration={duration}
                onSeek={seek}
                className="flex-1"
              />
              <span className="w-10">{formatTime(duration)}</span>
            </div>

            {/* Main controls only; the rest sit behind "More options". */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center">
              <PlayerButton
                label={isLiked ? "Remove from favourites" : "Add to favourites"}
                aria-pressed={isLiked}
                onClick={() => toggleLike(song.id)}
                className="justify-self-start"
              >
                <Like liked={isLiked} />
              </PlayerButton>
              <div className="flex items-center gap-3">
                <PlayerButton label="Previous" onClick={previous}>
                  <SkipBack className="size-6" />
                </PlayerButton>
                <PlayerButton
                  label={isPlaying ? "Pause" : "Play"}
                  onClick={togglePlay}
                  className="size-14 bg-white text-slate-900 hover:bg-white/90"
                >
                  {isPlaying ? <Pause className="size-6" /> : <Play className="size-6 translate-x-px" />}
                </PlayerButton>
                <PlayerButton label="Next" onClick={next}>
                  <SkipForward className="size-6" />
                </PlayerButton>
              </div>
              <div className="relative justify-self-end">
                <PlayerButton
                  label="More options"
                  aria-expanded={showMenu}
                  aria-haspopup="dialog"
                  onClick={() => setShowMenu((open) => !open)}
                  className="relative"
                >
                  <Ellipsis className="size-5" />
                  {/* A dot shows that a secondary mode is on. */}
                  {(shuffle || repeatMode !== "off" || sleepTimer.isActive || speed !== 1) && (
                    <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-highlight" />
                  )}
                </PlayerButton>
                {showMenu && (
                  <MoreControls
                    onClose={() => setShowMenu(false)}
                    shuffle={shuffle}
                    toggleShuffle={toggleShuffle}
                    repeatIcon={<RepeatIcon className="size-5" />}
                    repeatLabel={repeatLabel}
                    repeatOn={repeatMode !== "off"}
                    toggleRepeat={toggleRepeat}
                    volume={volume}
                    setVolume={setVolume}
                    speed={speed}
                    setSpeed={setSpeed}
                    sleepOn={sleepTimer.isActive}
                  />
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
