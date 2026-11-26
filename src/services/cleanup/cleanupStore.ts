import { withScreenOn } from "@/services/wakeLock";

// The clean up runs on its own, outside any page, so leaving Settings
// does not stop it and coming back shows it still running.

export type CleanupRun = {
  at: number;
  deviceBytes: number;
  githubFiles: number;
  githubBytes: number;
  githubSkipped?: boolean; // not signed in, so GitHub was not checked
};

export type CleanupState = {
  running: boolean;
  last?: CleanupRun;
  error?: string;
};

const LAST_KEY = "cleanup-last-run";

function readLast(): CleanupRun | undefined {
  try {
    const text = localStorage.getItem(LAST_KEY);
    return text ? (JSON.parse(text) as CleanupRun) : undefined;
  } catch {
    return undefined;
  }
}

let state: CleanupState = { running: false, last: readLast() };
const listeners = new Set<() => void>();

function set(next: Partial<CleanupState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export const getCleanup = () => state;
export const subscribeCleanup = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

// Runs `work` unless a clean up is running already.
export async function runCleanup(
  work: () => Promise<Omit<CleanupRun, "at">>,
  describe: (error: unknown) => string,
) {
  if (state.running) return;
  set({ running: true, error: undefined });
  try {
    const last = { at: Date.now(), ...(await withScreenOn(work)) };
    localStorage.setItem(LAST_KEY, JSON.stringify(last));
    set({ running: false, last });
  } catch (error) {
    set({ running: false, error: describe(error) });
  }
}
