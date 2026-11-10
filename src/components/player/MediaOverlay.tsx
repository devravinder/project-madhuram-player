import { Maximize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const HIDE_AFTER_MS = 3000;
const DOUBLE_TAP_MS = 280;
export const TAP_SEEK_SECONDS = 10;
export const BUTTON_SEEK_SECONDS = 15;

type Props = {
  isPlaying: boolean;
  togglePlay: VoidFunction;
  seekBy: (seconds: number) => void;
  // Video only: picture-in-picture and fullscreen, top right.
  video?: {
    canPictureInPicture: boolean;
    togglePictureInPicture: VoidFunction;
    enterFullscreen: VoidFunction;
  };
  className?: string;
};

function OverlayButton({
  label,
  onClick,
  className = "",
  children,
}: {
  label: string;
  onClick: VoidFunction;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation(); // a button press is not a tap on the media
        onClick();
      }}
      className={`cursor-pointer grid place-items-center rounded-full text-white bg-black/40 backdrop-blur-sm hover:bg-black/60 focus-visible:outline-2 focus-visible:outline-highlight ${className}`}
    >
      {children}
    </button>
  );
}

function SeekIcon({ forward }: { forward?: boolean }) {
  const Icon = forward ? RotateCw : RotateCcw;
  return (
    <span className="relative grid place-items-center">
      <Icon className="size-8 stroke-[1.5]" />
      <span className="absolute text-[10px] font-semibold leading-none">{BUTTON_SEEK_SECONDS}</span>
    </span>
  );
}

// Controls over the cover or video, shown on tap like a video app:
// back / play-pause / forward in the middle, and for video the
// picture-in-picture and fullscreen buttons top right. A double tap on
// the left or right side jumps back or forward.
export default function MediaOverlay({ isPlaying, togglePlay, seekBy, video, className = "" }: Props) {
  const [visible, setVisible] = useState(false);
  const [flash, setFlash] = useState<{ side: "left" | "right"; key: number }>();
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastTap = useRef<{ at: number; side: "left" | "right" }>(undefined);

  // While playing, the controls step aside after a moment; paused, they stay.
  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    if (isPlaying) hideTimer.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
  }, [isPlaying]);

  useEffect(() => {
    if (visible) scheduleHide();
    return () => clearTimeout(hideTimer.current);
  }, [visible, scheduleHide]);

  useEffect(
    () => () => {
      clearTimeout(hideTimer.current);
      clearTimeout(tapTimer.current);
    },
    [],
  );

  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const side = x < 0.5 ? "left" : "right";
    const now = Date.now();
    const previous = lastTap.current;

    // Second tap on the same side, quickly: jump instead of toggling.
    const outer = x < 1 / 3 || x > 2 / 3;
    if (previous && now - previous.at < DOUBLE_TAP_MS && previous.side === side && outer) {
      clearTimeout(tapTimer.current);
      lastTap.current = undefined;
      seekBy(side === "left" ? -TAP_SEEK_SECONDS : TAP_SEEK_SECONDS);
      setFlash({ side, key: now });
      return;
    }
    lastTap.current = { at: now, side };
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setVisible((v) => !v), DOUBLE_TAP_MS);
  };

  // Any use of a control keeps them up a little longer.
  const keep = (action: VoidFunction) => () => {
    action();
    scheduleHide();
  };

  return (
    <div
      className={`absolute inset-0 select-none ${className}`}
      onClick={onTap}
      // Keyboard users reach the controls by tabbing; show them then.
      onFocus={() => setVisible(true)}
      data-testid="media-overlay"
    >
      <div
        className={`absolute inset-0 rounded-[inherit] bg-black/35 transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {video && (
          <div className="absolute top-3 right-3 flex gap-2">
            {video.canPictureInPicture && (
              <OverlayButton
                label="Picture in picture"
                onClick={keep(video.togglePictureInPicture)}
                className="size-10"
              >
                <PictureInPicture2 className="size-5" />
              </OverlayButton>
            )}
            <OverlayButton label="Fullscreen" onClick={keep(video.enterFullscreen)} className="size-10">
              <Maximize className="size-5" />
            </OverlayButton>
          </div>
        )}

        {/* Buttons react only while shown, so a tap on the hidden layer just shows them. */}
        <div
          className={`absolute inset-0 flex items-center justify-center gap-6 pointer-events-none ${
            visible ? "[&>*]:pointer-events-auto" : ""
          }`}
        >
          <OverlayButton
            label={`Back ${BUTTON_SEEK_SECONDS} seconds`}
            onClick={keep(() => seekBy(-BUTTON_SEEK_SECONDS))}
            className="size-12"
          >
            <SeekIcon />
          </OverlayButton>
          <OverlayButton
            label={isPlaying ? "Pause" : "Play"}
            onClick={keep(togglePlay)}
            className="size-16 bg-black/55"
          >
            {isPlaying ? <Pause className="size-8" /> : <Play className="size-8 translate-x-0.5" />}
          </OverlayButton>
          <OverlayButton
            label={`Forward ${BUTTON_SEEK_SECONDS} seconds`}
            onClick={keep(() => seekBy(BUTTON_SEEK_SECONDS))}
            className="size-12"
          >
            <SeekIcon forward />
          </OverlayButton>
        </div>
      </div>

      {flash && (
        <span
          key={flash.key}
          aria-live="polite"
          onAnimationEnd={() => setFlash(undefined)}
          className={`absolute top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-full bg-black/60 text-white text-sm font-semibold pointer-events-none animate-out fade-out duration-700 fill-mode-forwards ${
            flash.side === "left" ? "left-4" : "right-4"
          }`}
        >
          {flash.side === "left" ? `−${TAP_SEEK_SECONDS}s` : `+${TAP_SEEK_SECONDS}s`}
        </span>
      )}
    </div>
  );
}
