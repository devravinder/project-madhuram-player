import { expect, importFiles, test, tryWithoutLogin, wavBuffer } from "./fixtures";

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

  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const name of ["Minimize player", "Previous", /^(Play|Pause)$/, "Next", "More options"]) {
      const box = (await player.getByRole("button", { name }).boundingBox())!;
      expect(box.y + box.height, `${size.width}x${size.height} ${name}`).toBeLessThanOrEqual(size.height);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    }
    const cover = (await player.getByRole("img", { name: "Tall Cover" }).boundingBox())!;
    expect(Math.abs(cover.width - cover.height)).toBeLessThan(2); // stays square
    expect(cover.y + cover.height).toBeLessThanOrEqual(size.height);
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
