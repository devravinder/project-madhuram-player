import { Volume1, Volume2, VolumeX } from "lucide-react";
import React, { useCallback, useRef } from "react";

interface VolumeSliderProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
}

export function VolumeSlider({ volume, onVolumeChange }: VolumeSliderProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current) return;

      const rect = barRef.current.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      onVolumeChange(Math.max(0, Math.min(1, percent)));
    },
    [onVolumeChange]
  );

  const toggleMute = () => {
    onVolumeChange(volume === 0 ? 0.7 : 0);
  };

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="w-full hidden sm:flex items-center justify-between gap-2 ">
      <button
        onClick={toggleMute}
        className="p-2 cursor-pointer rounded-full hover:bg-accent"
      >
        <VolumeIcon size={18} />
      </button>
      <div
        ref={barRef}
        className="grow h-1 bg-muted rounded-full cursor-pointer group"
        onClick={handleClick}
      >
        <div
          className="h-full bg-foreground rounded-full relative transition-all"
          style={{ width: `${volume * 100}%` }}
        >
          <div className="w-3 h-3 bg-primary rounded-full shadow-lg cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2" />
        </div>
      </div>
    </div>
  );
}
