import { pageVisibility } from "./pageVisibility";

// While the app is in the background, a cut-off request is tried again
// every few seconds (or as soon as the app is back), for up to 30 minutes.
const BACKGROUND_RETRY_MS = 5_000;
const BACKGROUND_MAX_MS = 30 * 60 * 1000;
const BACKGROUND_MAX_ATTEMPTS = 400;
// Back in front, the phone's network can take a moment to return.
const RETRIES_AFTER_BACK = 3;
const AFTER_BACK_DELAY_MS = 1_000;

export type Visibility = Pick<
  typeof pageVisibility,
  "isHidden" | "hiddenTimes" | "waitUntilVisible"
>;
export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export type RetryOptions = { visibility?: Visibility; sleep?: Sleep };

// Runs `send`, and when it fails with a network error because the app went
// to the background, waits for the app to come back and tries again. A
// network error with the app in front all along is passed straight on.
export async function retryInBackground<T>(
  send: () => Promise<T>,
  isNetworkError: (error: unknown) => boolean,
  { visibility = pageVisibility, sleep = realSleep }: RetryOptions = {},
): Promise<T> {
  const started = Date.now();
  const hiddenAtStart = visibility.hiddenTimes();
  let sawHidden = visibility.isHidden();
  let retriesAfterBack = 0;

  for (let attempt = 1; ; attempt++) {
    try {
      return await send();
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      const hidden = visibility.isHidden();
      sawHidden ||= hidden || visibility.hiddenTimes() !== hiddenAtStart;
      const tooLong =
        Date.now() - started > BACKGROUND_MAX_MS || attempt >= BACKGROUND_MAX_ATTEMPTS;
      if (!sawHidden || tooLong) throw error;

      if (hidden) {
        await visibility.waitUntilVisible(BACKGROUND_RETRY_MS);
      } else {
        if (retriesAfterBack >= RETRIES_AFTER_BACK) throw error;
        retriesAfterBack++;
        await sleep(AFTER_BACK_DELAY_MS * retriesAfterBack);
      }
    }
  }
}
