import { Button } from "@/components/Elements";
import { useSync } from "@/context/SyncContext";
import { useAuth } from "@/hooks/useAuth";
import { useSavedHashes } from "@/hooks/useSavedHashes";
import { downloadCopy } from "@/services/public/remote";
import type { Song } from "@/types/music";
import { Download } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

// Saves every track not yet on this device, one after another.
export default function DownloadAll({ songs }: { songs: Song[] }) {
  const saved = useSavedHashes();
  const { status } = useAuth();
  const { sync } = useSync();
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const stop = useRef(false);

  const missing = songs.filter((song) => !song.sha256 || !saved.has(song.sha256));

  const run = async () => {
    stop.current = false;
    const queue = [...missing];
    let done = 0;
    let failed = 0;
    setProgress({ done, total: queue.length });

    for (const song of queue) {
      if (stop.current) break;
      try {
        await downloadCopy(song);
        done++;
      } catch {
        failed++;
      }
      setProgress({ done: done + failed, total: queue.length });
    }

    setProgress(undefined);
    const failures = failed > 0 ? `, ${failed} failed` : "";
    toast(`Saved ${done} of ${queue.length}${failures}`);
    if (done > 0 && status === "signed-in") void sync("upload");
  };

  if (progress) {
    return (
      <Button.Secondary onClick={() => (stop.current = true)} className="whitespace-nowrap">
        Stop ({progress.done}/{progress.total})
      </Button.Secondary>
    );
  }

  return (
    <Button.Secondary onClick={run} disabled={missing.length === 0} className="whitespace-nowrap disabled:opacity-60">
      <Download size={18} />
      <span className="hidden sm:block">
        {missing.length === 0 ? "All saved" : `Download all (${missing.length})`}
      </span>
    </Button.Secondary>
  );
}