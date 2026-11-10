import { formatSecods } from "@/services/timeUtil";
import { useEffect, useState } from "react";


export default function StopWatch({ seconds }: { seconds: number }) {
  const [remainingTime, setRemainingTime] = useState(seconds);

  useEffect(() => {
    const timerId = setInterval(() => {
      setRemainingTime((remainingTime) => remainingTime - 1);
    }, 1000);

    return () => {
      clearInterval(timerId);
    };
  }, []);

  return <>{formatSecods(remainingTime)}</>;
}
