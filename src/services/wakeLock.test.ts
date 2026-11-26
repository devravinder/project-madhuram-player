import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A browser's wake lock: one screen lock at a time, dropped when hidden.
function fakeBrowser() {
  const listeners: Record<string, (() => void)[]> = {};
  const state = {
    visibility: "visible",
    requests: 0,
    active: 0,
    refuse: false,
  };
  const page = {
    get visibilityState() {
      return state.visibility;
    },
    addEventListener: (type: string, fn: () => void) =>
      (listeners[type] ??= []).push(fn),
  };
  const dropAll: (() => void)[] = [];
  const wakeLock = {
    request: async () => {
      state.requests++;
      if (state.refuse) throw new Error("NotAllowedError");
      state.active++;
      const onRelease: (() => void)[] = [];
      const sentinel = {
        released: false,
        release: async () => {
          if (sentinel.released) return;
          sentinel.released = true;
          state.active--;
          onRelease.forEach((fn) => fn());
        },
        addEventListener: (_: "release", fn: () => void) => onRelease.push(fn),
      };
      dropAll.push(() => void sentinel.release());
      return sentinel;
    },
  };
  const hide = () => {
    state.visibility = "hidden";
    dropAll.splice(0).forEach((drop) => drop()); // the browser lets go
    listeners.visibilitychange?.forEach((fn) => fn());
  };
  const show = () => {
    state.visibility = "visible";
    listeners.visibilitychange?.forEach((fn) => fn());
  };
  return { state, page, wakeLock, hide, show };
}

let browser: ReturnType<typeof fakeBrowser>;
const flush = () => vi.advanceTimersByTimeAsync(0);
// Past the short delay before the lock is let go.
const settle = () => vi.advanceTimersByTimeAsync(5000);
const load = () => import("./wakeLock");

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  browser = fakeBrowser();
  vi.stubGlobal("document", browser.page);
  vi.stubGlobal("navigator", { wakeLock: browser.wakeLock });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("keeping the screen on", () => {
  it("holds the screen during the work and lets go after", async () => {
    const { withScreenOn, isScreenHeld } = await load();
    let during = false;

    await withScreenOn(async () => {
      await flush();
      during = isScreenHeld();
    });
    await settle();

    expect(during).toBe(true);
    expect(isScreenHeld()).toBe(false);
    expect(browser.state.active).toBe(0);
  });

  it("keeps one lock for work that follows other work", async () => {
    const { withScreenOn } = await load();
    await withScreenOn(flush);
    await flush();
    await withScreenOn(flush);
    expect(browser.state.requests).toBe(1);

    await settle();
    expect(browser.state.active).toBe(0);
  });

  it("uses one lock for several transfers, until the last one ends", async () => {
    const { holdScreen } = await load();
    const first = holdScreen();
    const second = holdScreen();
    await flush();
    expect(browser.state.active).toBe(1);

    first();
    first(); // calling twice does not count twice
    await flush();
    expect(browser.state.active).toBe(1);

    second();
    await settle();
    expect(browser.state.active).toBe(0);
  });

  it("takes it again when the app comes back to the screen", async () => {
    const { holdScreen, isScreenHeld } = await load();
    const release = holdScreen();
    await flush();

    browser.hide();
    await flush();
    expect(isScreenHeld()).toBe(false);

    browser.show();
    await flush();
    expect(isScreenHeld()).toBe(true);
    expect(browser.state.requests).toBe(2);

    release();
    await settle();
    browser.hide();
    browser.show();
    await flush();
    expect(browser.state.requests).toBe(2); // not after the work ended
  });

  it("carries on when the browser refuses or has no wake lock", async () => {
    browser.state.refuse = true;
    const { withScreenOn, isScreenHeld } = await load();
    await expect(withScreenOn(async () => "done")).resolves.toBe("done");
    expect(isScreenHeld()).toBe(false);

    vi.resetModules();
    vi.stubGlobal("navigator", {});
    const bare = await load();
    await expect(bare.withScreenOn(async () => 42)).resolves.toBe(42);
  });
});
