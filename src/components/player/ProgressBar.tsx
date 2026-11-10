import React, { useCallback, useRef } from "react";

interface ProgressBarProps {
  progress: number;
  duration: number;
  onSeek: (time: number) => void;
  className?: string;
}

const KEY_STEP_SECONDS = 5;

// A thin bar with a taller hit area, usable by touch, mouse and keyboard.
export function ProgressBar({ progress, duration, onSeek, className = "" }: ProgressBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (!barRef.current || duration === 0) return;
      const rect = barRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(percent * duration);
    },
    [duration, onSeek],
  );

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") onSeek(Math.min(duration, progress + KEY_STEP_SECONDS));
    else if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - KEY_STEP_SECONDS));
    else return;
    e.preventDefault();
  };

  const percentage = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div
      ref={barRef}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(progress)}
      className={`py-2 cursor-pointer group outline-none ${className}`}
      onClick={handleClick}
      onKeyDown={handleKey}
    >
      <div className="h-1 bg-muted rounded-full relative group-focus-visible:ring-2 group-focus-visible:ring-primary">
        <div
          className="h-full bg-primary rounded-full transition-all duration-100 relative"
          style={{ width: `${percentage}%` }}
        >
          <div className="w-3 h-3 bg-primary rounded-full shadow-lg opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-200 absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2" />
        </div>
      </div>
    </div>
  );
}
