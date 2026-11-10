import React, { useRef, useCallback } from 'react';

interface ProgressBarProps {
  progress: number;
  duration: number;
  onSeek: (time: number) => void;
}

export function ProgressBar({ progress, duration, onSeek }: ProgressBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (!barRef.current || duration === 0) return;
    
    const rect = barRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * duration);
  }, [duration, onSeek]);

  const percentage = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div 
      ref={barRef}
      className="h-1 bg-muted rounded-full cursor-pointer group relative"
      onClick={handleClick}
    >
      <div 
        className="h-full bg-primary rounded-full transition-all duration-100 relative"
        style={{ width: `${percentage}%` }}
      >
        <div className="w-3 h-3 bg-primary rounded-full shadow-lg cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2" />
      </div>
    </div>
  );
}
