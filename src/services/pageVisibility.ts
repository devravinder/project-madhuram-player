// Phones pause or cut a page's network when the user switches apps, even
// while its music keeps playing. This tells such failures from real offline.

const hasDocument = () => typeof document !== "undefined";

let hiddenTimes = 0;
if (hasDocument()) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") hiddenTimes++;
  });
}

export const pageVisibility = {
  isHidden: () => hasDocument() && document.visibilityState === "hidden",

  // Changes each time the page goes to the background.
  hiddenTimes: () => hiddenTimes,

  // Resolves when the page is visible again, or after maxMs.
  waitUntilVisible(maxMs: number): Promise<void> {
    if (!this.isHidden()) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onChange);
        resolve();
      };
      const onChange = () => document.visibilityState === "visible" && done();
      const timer = setTimeout(done, maxMs);
      document.addEventListener("visibilitychange", onChange);
    });
  },
};
