import { useSync } from "@/context/SyncContext";
import db from "@/services/db";
import { formatBytes } from "@/services/storageUsage";
import type { Song } from "@/types/music";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, CloudUpload } from "lucide-react";
import { useId, useState } from "react";

const EMPTY: Song[] = [];

// Songs on this device that are not on GitHub yet. The user picks what to
// upload, and into which library, so large files can be left out and
// shared music kept apart from private music.
export default function NotBackedUp() {
  const { phase, upload, libraries, defaultLibrary } = useSync();
  const [chosen, setChosen] = useState<string>();
  const pickerId = useId();
  const busy = phase !== "idle";
  const target = chosen && libraries?.some((l) => l.name === chosen) ? chosen : defaultLibrary;

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
  const canUpload = !busy && !!target;

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
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={pickerId} className="text-sm text-muted-foreground">
            Library
          </label>
          <select
            id={pickerId}
            value={target ?? ""}
            onChange={(event) => setChosen(event.target.value)}
            disabled={!libraries?.length}
            className="flex-1 min-w-0 px-2 py-1.5 rounded-md bg-accent text-sm font-mono"
          >
            {!libraries && <option value="">Loading...</option>}
            {libraries?.map((library) => (
              <option key={library.name} value={library.name}>
                {library.name}
                {library.isPrivate ? "" : " (public)"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => target && void upload(songs.map((s) => s.id), target)}
            disabled={!canUpload}
            className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CloudUpload size={16} /> Upload all
          </button>
        </div>

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
                onClick={() => target && void upload([song.id], target)}
                disabled={!canUpload}
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
