import type { Page } from "@playwright/test";
import { expect, importFiles, test, tryWithoutLogin, wavBuffer } from "./fixtures";

// Records a short video in the page and adds it to the library as "A Video",
// listed before any imported song.
async function addVideo(page: Page, seconds = 3) {
  await page.evaluate(async (seconds) => {
    const { saveFile } = await import(/* @vite-ignore */ "/src/services/filesService.ts");
    const { default: db } = await import(/* @vite-ignore */ "/src/services/db.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const g = canvas.getContext("2d")!;
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((r) => (recorder.onstop = r));
    recorder.start();
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const draw = () => {
        g.fillStyle = `hsl(${(performance.now() - start) / 10}, 80%, 50%)`;
        g.fillRect(0, 0, 320, 180);
        if (performance.now() - start < seconds * 1000) requestAnimationFrame(draw);
        else resolve();
      };
      draw();
    });
    recorder.stop();
    await stopped;
    const media = await saveFile(new File(chunks, "clip.webm", { type: "video/webm" }));
    await db.songs.add({
      id: "video1", title: "A Video", artist: "Unknown", album: "Unknown", duration: seconds,
      addedAt: new Date(0), kind: "video", mediaId: media.id, mime: "video/webm", bytes: 1,
    });
  }, seconds);
}

const openPlayer = async (page: Page, title: string) => {
  await page.getByText(title, { exact: true }).click();
  await page.getByRole("button", { name: /^Open player/ }).click();
  return page.getByRole("dialog", { name: /Now playing/ });
};

// The tap layer is see-through until the media is tapped.
const overlayShown = (page: Page) =>
  page.getByTestId("media-overlay").locator("> div").first();

const SIZES = [
  { width: 320, height: 568 }, // small phone
  { width: 550, height: 322 }, // phone held sideways
  { width: 1440, height: 900 }, // desktop
];

test("open player keeps its controls on screen at every size", async ({ page }) => {
  await tryWithoutLogin(page);
  await importFiles(page, [{ name: "Tall Cover.wav", buffer: wavBuffer(20) }]);

  // A tall (1:3) cover used to push the controls off screen.
  await page.evaluate(async () => {
    const { saveFile } = await import(/* @vite-ignore */ "/src/services/filesService.ts");
    const { default: db } = await import(/* @vite-ignore */ "/src/services/db.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 300;
    canvas.getContext("2d")!.fillRect(0, 0, 100, 300);
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/png"));
    const cover = await saveFile(new File([blob], "cover.png", { type: "image/png" }));
    const [song] = await db.songs.toArray();
    await db.songs.update(song.id, { coverImageId: cover.id });
  });
  await page.goto("/#/settings");
  await page.goto("/#/library");

  await page.getByText("Tall Cover", { exact: true }).click();
  await page.getByRole("button", { name: /^Open player/ }).click();
  const player = page.getByRole("dialog", { name: /Now playing/ });
  const controls = player.getByRole("region", { name: "Playback controls" });

  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const name of ["Minimize player", "Previous", /^(Play|Pause)$/, "Next", "More options"]) {
      const box = (await controls.getByRole("button", { name }).boundingBox())!;
      expect(box.y + box.height, `${size.width}x${size.height} ${name}`).toBeLessThanOrEqual(size.height);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    }
    const cover = (await player.getByRole("img", { name: "Tall Cover" }).boundingBox())!;
    expect(Math.abs(cover.width - cover.height)).toBeLessThan(2); // stays square
    expect(cover.y + cover.height).toBeLessThanOrEqual(size.height);

    // Minimize is within thumb reach: right side, lower half on a phone.
    const minimize = (await player.getByRole("button", { name: "Minimize player" }).boundingBox())!;
    expect(minimize.x).toBeGreaterThan(size.width / 2);
    if (size.height > size.width) expect(minimize.y).toBeGreaterThan(size.height / 2);
    await page.screenshot({ path: `test-results/player-${size.width}x${size.height}.png` });
  }

  // Secondary controls wait behind "More options".
  await expect(player.getByRole("button", { name: "Shuffle" })).toHaveCount(0);
  await player.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Shuffle" }).click();
  await expect(page.getByRole("button", { name: "Shuffle" })).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Escape"); // closes the options
  await page.keyboard.press("Escape"); // minimizes the player
  await expect(player).toBeHidden();
  await expect(page.getByRole("button", { name: /^Open player/ })).toBeVisible();
});

test("next from a video to an audio song keeps playing", async ({ page }) => {
  const { mediaState } = await import("./fixtures");
  await tryWithoutLogin(page);
  await importFiles(page, [{ name: "After Video.wav", buffer: wavBuffer(20) }]);
  await addVideo(page);
  await page.goto("/#/settings");
  await page.goto("/#/library");

  await page.getByText("A Video", { exact: true }).click();
  await page.getByRole("button", { name: /^Open player/ }).click();
  const player = page.getByRole("dialog", { name: /Now playing/ });
  await expect.poll(async () => !(await mediaState(page)).paused).toBe(true);

  await player.getByRole("button", { name: "Next" }).click();

  await expect(player).toHaveAccessibleName(/After Video/);
  await expect
    .poll(async () => {
      const state = await mediaState(page);
      return !state.paused && state.time > 0.5;
    }, { timeout: 10_000 })
    .toBe(true);
  await expect(player.getByRole("region", { name: "Playback controls" }).getByRole("button", { name: "Pause" })).toBeVisible();
});

test("the playing song's waves use the same accent as its title", async ({ page }) => {
  const { songRow } = await import("./fixtures");
  await tryWithoutLogin(page);
  await importFiles(page, [{ name: "Wave Color.wav", buffer: wavBuffer(10) }]);

  await page.getByText("Wave Color", { exact: true }).click();
  const row = songRow(page, "Wave Color");
  const colors = await row.evaluate((el) => {
    const title = el.querySelector("p")!;
    const bar = el.querySelector(".animate-wave, .rounded-full.w-1") as HTMLElement;
    return { title: getComputedStyle(title).color, bar: getComputedStyle(bar).backgroundColor };
  });

  expect(colors.bar).toBe(colors.title);
  expect(colors.bar).not.toBe("rgb(255, 255, 255)");
});

test("tapping a song's cover shows play and seek, but no fullscreen", async ({ page }) => {
  const { mediaState } = await import("./fixtures");
  await tryWithoutLogin(page);
  await importFiles(page, [{ name: "Tap Song.wav", buffer: wavBuffer(30) }]);
  const player = await openPlayer(page, "Tap Song");
  const overlay = page.getByTestId("media-overlay");

  await expect(overlayShown(page)).toHaveCSS("opacity", "0");
  await overlay.click();
  await expect(overlayShown(page)).toHaveCSS("opacity", "1");
  await expect(player.getByRole("button", { name: "Fullscreen" })).toHaveCount(0);

  // Pausing from the cover keeps the controls up.
  await overlay.getByRole("button", { name: "Pause" }).click();
  await expect.poll(async () => (await mediaState(page)).paused).toBe(true);
  await page.waitForTimeout(3500);
  await expect(overlayShown(page)).toHaveCSS("opacity", "1");

  const before = (await mediaState(page)).time;
  await overlay.getByRole("button", { name: "Forward 15 seconds" }).click();
  await expect.poll(async () => (await mediaState(page)).time).toBeGreaterThan(before + 14);
});

test("double tap on the right or left jumps 10 seconds", async ({ page }) => {
  const { mediaState } = await import("./fixtures");
  await tryWithoutLogin(page);
  await importFiles(page, [{ name: "Jump Song.wav", buffer: wavBuffer(40) }]);
  await openPlayer(page, "Jump Song");
  const overlay = page.getByTestId("media-overlay");
  const box = (await overlay.boundingBox())!;

  const before = (await mediaState(page)).time;
  await page.mouse.dblclick(box.x + box.width * 0.9, box.y + box.height * 0.1);
  await expect.poll(async () => (await mediaState(page)).time).toBeGreaterThan(before + 9);
  await expect(page.getByText("+10s")).toBeVisible();
  await expect(overlayShown(page)).toHaveCSS("opacity", "0"); // a jump does not open the controls

  const after = (await mediaState(page)).time;
  await page.mouse.dblclick(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await expect.poll(async () => (await mediaState(page)).time).toBeLessThan(after - 8);
});

test("tapping a video shows fullscreen at the top right and hides again", async ({ page }) => {
  await tryWithoutLogin(page);
  await importFiles(page, [{ name: "Other.wav", buffer: wavBuffer(5) }]);
  await addVideo(page, 8);
  await page.goto("/#/settings");
  await page.goto("/#/library");
  const player = await openPlayer(page, "A Video");
  const overlay = page.getByTestId("media-overlay");

  await overlay.click();
  await expect(overlayShown(page)).toHaveCSS("opacity", "1");
  const fullscreen = (await player.getByRole("button", { name: "Fullscreen" }).boundingBox())!;
  const media = (await overlay.boundingBox())!;
  expect(fullscreen.x).toBeGreaterThan(media.x + media.width / 2);
  expect(fullscreen.y).toBeLessThan(media.y + media.height / 4);

  // While it plays, the controls step aside after a few seconds.
  await expect(overlayShown(page)).toHaveCSS("opacity", "0", { timeout: 6000 });
});
