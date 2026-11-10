import { expect, importFiles, signInWithFake, test, wavBuffer } from "./fixtures";

const REPO = "project-music-files";

const remoteTitles = (page: import("@playwright/test").Page) =>
  page.evaluate((repo) => {
    const index = JSON.parse((window as any).__fake.fileText(repo, "index.json"));
    return index.tracks.filter((t: any) => !t.deleted).map((t: any) => t.title).sort();
  }, REPO);

const wipeDevice = (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const { default: db } = await import(/* @vite-ignore */ "/src/services/db.ts");
    await Promise.all([db.songs.clear(), db.files.clear(), db.syncState.clear(), db.outbox.clear()]);
  });

test("backs a library up to GitHub and restores it on a fresh device", async ({ page }) => {
  await signInWithFake(page);
  await importFiles(page, [
    { name: "Alpha.wav", buffer: wavBuffer(3) },
    { name: "Beta.wav", buffer: wavBuffer(4, 5) },
  ]);

  await page.goto("/#/settings");
  await expect(page.getByText(`tester/${REPO}`)).toBeVisible();
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect(page.getByText("Synced 2 items.")).toBeVisible({ timeout: 20_000 });
  expect(await remoteTitles(page)).toEqual(["Alpha", "Beta"]);
  expect(await page.evaluate((r) => (window as any).__fake.repos.get(r).private, REPO)).toBe(true);

  await wipeDevice(page);
  await page.getByRole("button", { name: "Download" }).click();
  await expect(page.getByText("Synced 2 items.")).toBeVisible({ timeout: 20_000 });

  const restored = await page.evaluate(async () => {
    const { getSongs } = await import(/* @vite-ignore */ "/src/services/songsService.ts");
    const { getFile } = await import(/* @vite-ignore */ "/src/services/filesService.ts");
    const songs = await getSongs();
    return Promise.all(
      songs.map(async (s: any) => ({ title: s.title, bytes: (await getFile(s.mediaId)).data.size })),
    );
  });
  expect(restored.sort((a, b) => a.title.localeCompare(b.title))).toEqual([
    { title: "Alpha", bytes: 44 + 8000 * 3 },
    { title: "Beta", bytes: 44 + 8000 * 4 },
  ]);

  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect(page.getByText("Everything is up to date.")).toBeVisible({ timeout: 15_000 });
});

test("waits out a GitHub rate limit and carries on by itself", async ({ page }) => {
  await signInWithFake(page);
  await importFiles(page, [{ name: "Gamma.wav", buffer: wavBuffer(2) }]);
  await page.goto("/#/settings");

  await page.evaluate(() => (window as any).__fake.limitNextWrites(1));
  await page.getByRole("button", { name: "Sync", exact: true }).click();

  await expect(page.getByText(/slow down\. Continues by itself at/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Synced 1 item.")).toBeVisible({ timeout: 20_000 });
  expect(await remoteTitles(page)).toEqual(["Gamma"]);
});

test("removing the token keeps the music and hides the backup", async ({ page }) => {
  await signInWithFake(page);
  await importFiles(page, [{ name: "Delta.wav", buffer: wavBuffer(2) }]);
  await page.goto("/#/settings");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove token" }).click();

  await expect(page.getByText("Not signed in")).toBeVisible();
  await expect(page.getByText("GitHub backup")).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("madhuram.github.token"))).toBeNull();
  await page.goto("/#/library");
  await expect(page.getByText("1 songs")).toBeVisible();
});

const remotePaths = (page: import("@playwright/test").Page) =>
  page.evaluate((repo) => (window as any).__fake.paths(repo) as string[], REPO);

const openDelete = async (page: import("@playwright/test").Page, title: string) => {
  const { songRow } = await import("./fixtures");
  await songRow(page, title).locator('[aria-haspopup="menu"]').click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  return page.getByRole("dialog", { name: `Delete “${title}”?` });
};

test("deletes a backed-up song from GitHub, or from this device only", async ({ page }) => {
  await signInWithFake(page);
  await importFiles(page, [
    { name: "Gone.wav", buffer: wavBuffer(2) },
    { name: "Kept.wav", buffer: wavBuffer(2, 5) },
  ]);
  await page.goto("/#/settings");
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect(page.getByText("Synced 2 items.")).toBeVisible({ timeout: 20_000 });
  const before = (await remotePaths(page)).length;

  // Delete everywhere: the files leave GitHub straight away.
  await page.goto("/#/library");
  const dialog = await openDelete(page, "Gone");
  await dialog.getByRole("button", { name: /Delete everywhere/ }).click();
  await expect(page.getByText("Deleted everywhere")).toBeVisible({ timeout: 15_000 });
  expect(await remoteTitles(page)).toEqual(["Kept"]);
  expect((await remotePaths(page)).length).toBe(before - 2); // manifest + one part

  // This device only: GitHub keeps it, a Download sync brings it back.
  await (await openDelete(page, "Kept")).getByRole("button", { name: /this device only/ }).click();
  await expect(page.getByText("Removed from this device. It is still on GitHub.")).toBeVisible();
  expect(await remoteTitles(page)).toEqual(["Kept"]);

  await page.goto("/#/settings");
  await expect(page.getByText("1 song is kept on GitHub only.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect(page.getByText("Everything is up to date.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Download" }).click();
  await expect(page.getByText("Synced 1 item.")).toBeVisible({ timeout: 20_000 });
  await page.goto("/#/library");
  await expect(page.getByText("1 songs")).toBeVisible();
  await expect(page.getByText("Kept", { exact: true })).toBeVisible();
});
