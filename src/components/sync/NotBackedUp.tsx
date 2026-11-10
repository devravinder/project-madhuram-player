import { useSync } from "@/context/SyncContext";
import db from "@/services/db";
import { formatBytes } from "@/services/storageUsage";
import type { Song } from "@/types/music";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, CloudUpload } from "lucide-react";

const EMPTY: Song[] = [];

// Songs on this device that are not on GitHub yet, so the user picks
// what to upload and can leave large files out.
export default function NotBackedUp() {
  const { phase, upload, sync } = useSync();
  const busy = phase !== "idle";

  const songs = useLiveQuery(async () => {
    const backedUp = new Set(await db.syncState.toCollection().primaryKeys());
    const all = await db.songs.toArray();
    return all
      .filter((song) => !backedUp.has(song.id))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [], EMPTY);

  if (songs.length === 0) {
    return <p className="text-sm text-muted-foreground">Every song is backed up.</p>;
  }

  const total = songs.reduce((sum, song) => sum + (song.bytes ?? 0), 0);

  return (
    <details className="group border border-card rounded-lg">
      <summary className="cursor-pointer list-none flex items-center gap-2 p-2">
        <ChevronRight
          size={18}
          aria-hidden
          className="transition-transform group-open:rotate-90"
        />
        <span className="font-medium">Not backed up ({songs.length})</span>
        <span className="text-sm text-muted-foreground">{formatBytes(total)}</span>
      </summary>

      <div className="flex flex-col gap-2 p-2 pt-0">
        <button
          type="button"
          onClick={() => void sync("upload")}
          disabled={busy}
          className="cursor-pointer self-start flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <CloudUpload size={16} /> Upload all
        </button>

        <ul className="flex flex-col divide-y divide-card max-h-80 overflow-y-auto">
          {songs.map((song) => (
            <li key={song.id} className="flex items-center gap-2 py-1.5">
              <span className="flex-1 min-w-0">
                <span className="block truncate">{song.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatBytes(song.bytes ?? 0)}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Upload ${song.title}`}
                onClick={() => void upload([song.id])}
                disabled={busy}
                className="cursor-pointer flex items-center gap-1 px-2 py-1 rounded-md text-sm bg-accent hover:bg-accent/80 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <CloudUpload size={16} /> Upload
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
