// Keeps the screen on while a sync, upload or download runs, so the phone
// does not sleep and stop it. The browser lets go whenever the app leaves
// the screen; it is taken again when the app is back, if still needed.
// Without support (older browsers) everything works as before.

type Sentinel = {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", fn: () => void): void;
};
type WakeLockApi = { request(type: "screen"): Promise<Sentinel> };

let holders = 0;
let sentinel: Sentinel | undefined;
let requesting = false;
const listeners = new Set<() => void>();

const api = (): WakeLockApi | undefined =>
  typeof navigator !== "undefined"
    ? (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock
    : undefined;

const visible = () =>
  typeof document === "undefined" || document.visibilityState === "visible";

const notify = () => listeners.forEach((listener) => listener());

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
      notify();
    });
    notify();
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
  notify();
}

let watching = false;
function watchVisibility() {
  if (watching || typeof document === "undefined") return;
  watching = true;
  document.addEventListener("visibilitychange", () => void take());
}

// Keeps the screen on until the returned function is called. Several
// transfers can hold it at once; it goes off after the last one.
export function holdScreen(): () => void {
  watchVisibility();
  holders++;
  void take();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holders--;
    if (holders === 0) void letGo();
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

export function subscribeScreenHeld(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
