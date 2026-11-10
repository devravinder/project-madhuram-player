import { IconButton } from "@/components/Elements";
import { useSavedHashes } from "@/hooks/useSavedHashes";
import { downloadCopy } from "@/services/public/remote";
import type { Song } from "@/types/music";
import { Check, Download, LoaderCircle } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { toast } from "sonner";

// Saves a track from a public library as the user's own copy.
export default function RemoteSongActions({ song }: { song: Song }) {
  const saved = useSavedHashes();
  const [busy, setBusy] = useState(false);

  const isSaved = !!song.sha256 && saved.has(song.sha256);

  const download = async (event: MouseEvent) => {
    event.stopPropagation();
    if (busy || isSaved) return;
    setBusy(true);
    try {
      await downloadCopy(song);
      // Backing it up is the user's choice, in Settings.
      toast.success(`Saved ${song.title}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  if (isSaved) {
    return (
      <span className="p-2 text-primary" role="img" aria-label="Saved on this device">
        <Check size={20} />
      </span>
    );
  }

  return (
    <IconButton
      aria-label={`Download ${song.title}`}
      onClick={download}
      disabled={busy}
      className="h-9 w-9 disabled:opacity-60"
    >
      {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Download size={18} />}
    </IconButton>
  );
}