// Keeps the screen on only while work runs: a sync, an upload, a download
// or a GitHub call. Waiting (offline, paused) lets it go. The browser lets
// go whenever the app leaves the screen; it is taken again when the app is
// back, if still needed. Without support everything works as before.

type Sentinel = {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", fn: () => void): void;
};
type WakeLockApi = { request(type: "screen"): Promise<Sentinel> };

// Work that follows other work (the next song of a batch) keeps the same
// lock instead of letting the screen go dark in between.
export const RELEASE_DELAY_MS = 2000;

let holders = 0;
let sentinel: Sentinel | undefined;
let requesting = false;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;

const api = (): WakeLockApi | undefined =>
  typeof navigator !== "undefined"
    ? (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock
    : undefined;

const visible = () =>
  typeof document === "undefined" || document.visibilityState === "visible";

async function take() {
  const wakeLock = api();
  if (!wakeLock || holders === 0 || sentinel || requesting || !visible())
    return;
  requesting = true;
  try {
    const taken = await wakeLock.request("screen");
    if (holders === 0) {
      await taken.release(); // finished while asking
      return;
    }
    sentinel = taken;
    taken.addEventListener("release", () => {
      if (sentinel === taken) sentinel = undefined;
    });
  } catch {
    // Refused, for example in battery saver; the work goes on anyway.
  } finally {
    requesting = false;
  }
}

async function letGo() {
  const held = sentinel;
  sentinel = undefined;
  if (held && !held.released) await held.release().catch(() => undefined);
}

let watching = false;
function watchVisibility() {
  if (watching || typeof document === "undefined") return;
  watching = true;
  document.addEventListener("visibilitychange", () => void take());
}

// Keeps the screen on until the returned function is called. Several
// tasks can hold it at once; it goes off shortly after the last one.
export function holdScreen(): () => void {
  watchVisibility();
  clearTimeout(releaseTimer);
  holders++;
  void take();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holders--;
    if (holders > 0) return;
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
      if (holders === 0) void letGo();
    }, RELEASE_DELAY_MS);
  };
}

// Runs `work` with the screen kept on.
export async function withScreenOn<T>(work: () => Promise<T>): Promise<T> {
  const release = holdScreen();
  try {
    return await work();
  } finally {
    release();
  }
}

export const isScreenHeld = () => !!sentinel && !sentinel.released;
