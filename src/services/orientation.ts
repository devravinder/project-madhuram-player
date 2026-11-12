// Phones turn a wide video sideways in fullscreen, even with auto-rotate on.
// Tablets and computers are left alone, and so are portrait videos.

const PHONE_MAX_SHORT_SIDE = 600; // CSS pixels; tablets are wider

export type ScreenInfo = { touch: boolean; shortSide: number };

export function shouldLockLandscape(
  screenInfo: ScreenInfo,
  video: { width: number; height: number },
): boolean {
  const isPhone = screenInfo.touch && screenInfo.shortSide < PHONE_MAX_SHORT_SIDE;
  // Before the size is known (0 x 0) a video is taken as wide.
  const isWide = video.width >= video.height;
  return isPhone && isWide;
}

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

const currentScreen = (): ScreenInfo => ({
  touch: window.matchMedia("(pointer: coarse)").matches,
  shortSide: Math.min(window.screen.width, window.screen.height),
});

// Locks to landscape if this is a phone and the video is wide. Browsers
// that cannot lock (iPhone, desktop) simply keep turning with the device.
export async function lockLandscapeFor(video: HTMLVideoElement): Promise<boolean> {
  const orientation = window.screen.orientation as LockableOrientation | undefined;
  if (!orientation?.lock) return false;
  if (!shouldLockLandscape(currentScreen(), { width: video.videoWidth, height: video.videoHeight })) {
    return false;
  }
  try {
    await orientation.lock("landscape");
    return true;
  } catch {
    return false;
  }
}

export function unlockOrientation() {
  try {
    window.screen.orientation?.unlock?.();
  } catch {
    // Nothing was locked.
  }
}
