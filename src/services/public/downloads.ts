import type { Song } from "@/types/music";
import { NetworkError } from "@/services/httpError";
import { withScreenOn } from "@/services/wakeLock";
import { PublicLibraryError } from "./publicLibrary";
import { downloadCopy } from "./remote";

// Downloads from Explore outlive the page that started them, so leaving
// the page and coming back still shows what is downloading.

export type BatchProgress = { done: number; total: number };
export type BatchResult = { saved: number; failed: number; total: number };

type Snapshot = {
  songs: ReadonlySet<string>; // ids of songs downloading now
  batches: ReadonlyMap<string, BatchProgress>; // by library, owner/repo
};

const running = new Map<string, Promise<string>>();
const batches = new Map<string, BatchProgress & { stop: boolean }>();
const listeners = new Set<() => void>();
let snapshot: Snapshot = { songs: new Set(), batches: new Map() };

function notify() {
  snapshot = {
    songs: new Set(running.keys()),
    batches: new Map([...batches].map(([key, { done, total }]) => [key, { done, total }])),
  };
  listeners.forEach((listener) => listener());
}

export const subscribeDownloads = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
export const getDownloads = () => snapshot;

export const libraryKey = (song: Song) =>
  song.remote ? `${song.remote.owner}/${song.remote.repo}`.toLowerCase() : "";

const MAX_OFFLINE_WAITS = 5;
const RECHECK_MS = 5000;

export const isOfflineError = (error: unknown) =>
  error instanceof NetworkError ||
  (error instanceof PublicLibraryError && error.reason === "offline");

// Resolves when the connection is back (or soon, if the browser thinks
// it is online and the network just blinked).
function backOnline(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || navigator.onLine) {
      setTimeout(resolve, RECHECK_MS);
      return;
    }
    window.addEventListener("online", () => resolve(), { once: true });
  });
}

// A lost connection pauses the download instead of failing it; parts
// already here are kept, so it carries on with the rest. The screen is
// kept on while it downloads, not while it waits.
async function untilSaved(song: Song): Promise<string> {
  for (let waits = 0; ; waits++) {
    try {
      return await withScreenOn(() => downloadCopy(song));
    } catch (error) {
      if (!isOfflineError(error) || waits >= MAX_OFFLINE_WAITS) throw error;
      await backOnline();
    }
  }
}

// Saves one song; asking again while it downloads joins the same download.
export function downloadSong(song: Song): Promise<string> {
  const existing = running.get(song.id);
  if (existing) return existing;
  const download = untilSaved(song).finally(() => {
    running.delete(song.id);
    notify();
  });
  running.set(song.id, download);
  notify();
  return download;
}

// Saves the songs one after another. Undefined if this library is already
// downloading all.
export async function downloadAll(key: string, songs: Song[]): Promise<BatchResult | undefined> {
  if (batches.has(key)) return undefined;
  const batch = { done: 0, total: songs.length, stop: false };
  batches.set(key, batch);
  notify();
  let saved = 0;
  let failed = 0;
  try {
    for (const song of songs) {
      if (batch.stop) break;
      try {
        await downloadSong(song);
        saved++;
      } catch {
        failed++;
      }
      batch.done++;
      notify();
    }
  } finally {
    batches.delete(key);
    notify();
  }
  return { saved, failed, total: songs.length };
}

export function stopDownloadAll(key: string) {
  const batch = batches.get(key);
  if (batch) batch.stop = true;
}
