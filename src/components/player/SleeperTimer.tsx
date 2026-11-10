import { usePlayer } from "@/context/PlayerContext";
import { Timer, X } from "lucide-react";
import { useState } from "react";
import StopWatch from "../StopWatch";
import TimeInput from "../input/TimeInput";
import { timeDiffInSecods } from "@/services/timeUtil";

// The start value is read once on mount; StopWatch counts down from it.
function RemainingTime({ endTime }: { endTime: number }) {
  const [seconds] = useState(() => timeDiffInSecods(Date.now(), endTime));
  return <StopWatch seconds={seconds} />;
}

export default function SleeperTimer({ onClose }: { onClose?: VoidFunction }) {
  const { sleepTimer, setSleepTimer, cancelSleepTimer } = usePlayer();
  const [time, setTime] = useState(0);

  const showTimer = sleepTimer.isActive && sleepTimer.endTime;

  return (
    <div className="glass rounded-lg p-4 w-xs flex flex-col gap-2">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 text-primary">
          <Timer size={24} />
          <h2 className="text-xl font-bold">Sleep Timer</h2>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          className="p-2 rounded-lg hover:bg-accent cursor-pointer"
        >
          <X size={20} />
        </button>
      </div>
      {sleepTimer.isActive && (
        <div className="mb-4 p-4 bg-primary/10 rounded-xl">
          <p className="text-sm text-muted-foreground">Timer active</p>
          <p className="text-2xl font-bold text-primary">
            {!showTimer ? undefined : (
              <RemainingTime key={sleepTimer.endTime} endTime={sleepTimer.endTime!} />
            )}
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation()
              cancelSleepTimer();
              onClose?.();
            }}
            className="mt-2 text-sm text-destructive hover:underline"
          >
            Cancel Timer
          </button>
        </div>
      )}

      <div className="space-y-4">
        <TimeInput value={time} onChange={setTime} />
        <button
          onClick={(e) => {
            e.stopPropagation()
            setSleepTimer(time);
            onClose?.();
          }}
          disabled={time == 0}
          className={`disabled:cursor-not-allowed cursor-pointer w-full flex items-center justify-center p-3 rounded-xl transition-colors bg-primary/10 text-primary`}
        >
          Set Timer
        </button>
      </div>
    </div>
  );
}
