import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, mediaState, test, tryWithoutLogin, wavBuffer } from "./fixtures";

// The only test with the service worker on. Its parts come from the local
// dev server, so nothing here can reach GitHub; any GitHub request still
// fails the test through the fixture's guard.
test.use({ serviceWorkers: "allow" });

test("the service worker plays a split file part by part, and seeks", async ({ page }) => {
  // A 6 s sound cut into three parts, served by the dev server.
  const wav = wavBuffer(6);
  const cut = [0, 16_000, 32_000, wav.length];
  const folder = join("test-results", "stream-parts");
  mkdirSync(folder, { recursive: true });
  for (let n = 0; n < 3; n++) writeFileSync(join(folder, `p${n}.wav`), wav.subarray(cut[n], cut[n + 1]));

  await tryWithoutLogin(page);
  // The first visit installs the worker; it controls the page once claimed.
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 })
    .toBe(true);

  const src = await page.evaluate(
    async ({ cut, size }) => {
      const { canStream, streamLink } = await import(/* @vite-ignore */ "/src/services/stream/streamClient.ts");
      if (!(await canStream())) return "no-stream";
      const parts = [0, 1, 2].map((n) => ({
        url: `${location.origin}/test-results/stream-parts/p${n}.wav`,
        bytes: cut[n + 1] - cut[n],
      }));
      return streamLink({ mime: "audio/wav", size, parts });
    },
    { cut, size: wav.length },
  );
  expect(src).toContain("__stream?d=");

  const played = await page.evaluate(async (src) => {
    const audio = new Audio(src);
    await audio.play();
    await new Promise((r) => setTimeout(r, 800));
    const early = audio.currentTime;
    audio.currentTime = 5; // the last part
    await new Promise((r) => audio.addEventListener("seeked", r, { once: true }));
    await new Promise((r) => setTimeout(r, 500));
    const result = { early, late: audio.currentTime, duration: audio.duration, error: audio.error?.code };
    audio.pause();
    return result;
  }, src);

  expect(played.error).toBeUndefined();
  expect(played.early).toBeGreaterThan(0.3);
  expect(played.late).toBeGreaterThan(5);
  expect(played.duration).toBeCloseTo(6, 0);
  expect((await mediaState(page)).src).not.toContain("__stream"); // the app's player was not used
});
