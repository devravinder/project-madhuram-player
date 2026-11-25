import { Button } from "@/components/Elements";
import { useDownloads } from "@/hooks/useDownloads";
import { useSavedHashes } from "@/hooks/useSavedHashes";
import {
  downloadAll,
  libraryKey,
  stopDownloadAll,
} from "@/services/public/downloads";
import type { Song } from "@/types/music";
import { Download } from "lucide-react";
import { toast } from "sonner";

// Saves every track not yet on this device, one after another. It carries
// on when the page is left, and shows its progress again on return.
export default function DownloadAll({ songs }: { songs: Song[] }) {
  const saved = useSavedHashes();
  const key = songs[0] ? libraryKey(songs[0]) : "";
  const progress = useDownloads().batches.get(key);

  const missing = songs.filter(
    (song) => !song.sha256 || !saved.has(song.sha256),
  );

  const run = async () => {
    const result = await downloadAll(key, missing);
    if (!result) return;
    const failures = result.failed > 0 ? `, ${result.failed} failed` : "";
    toast(`Saved ${result.saved} of ${result.total}${failures}`);
  };

  if (progress) {
    return (
      <Button.Secondary
        onClick={() => stopDownloadAll(key)}
        className="whitespace-nowrap"
      >
        Stop ({progress.done}/{progress.total})
      </Button.Secondary>
    );
  }

  return (
    <Button.Secondary
      onClick={() => void run()}
      disabled={missing.length === 0}
      className="whitespace-nowrap disabled:opacity-60"
    >
      <Download size={18} />
      <span className="hidden sm:block">
        {missing.length === 0
          ? "All saved"
          : `Download all (${missing.length})`}
      </span>
    </Button.Secondary>
  );
}
