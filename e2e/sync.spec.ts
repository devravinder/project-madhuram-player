import { expect, importFiles, openSettings, signInWithFake, test, wavBuffer } from "./fixtures";

const REPO = "music-library";

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

// Settings has connected once the upload picker lists the libraries.
const librariesShown = (page: import("@playwright/test").Page) =>
  expect(page.locator(`option[value="${REPO}"]`).first()).toBeAttached({ timeout: 15_000 });

// Libraries are managed in Explore, from each card's More menu.
const moreButton = (page: import("@playwright/test").Page, repo: string) =>
  page.getByRole("button", { name: `More for ${repo}`, exact: true });
const libraryMenu = async (page: import("@playwright/test").Page, repo: string, item: string) => {
  await moreButton(page, repo).click();
  await page.getByRole("menuitem", { name: item }).click();
};
const createLibrary = async (page: import("@playwright/test").Page, expected: string) => {
  await page.goto("/#/explore");
  await page.getByRole("button", { name: "New library" }).click();
  const dialog = page.getByRole("dialog", { name: "New library" });
  await expect(dialog.getByLabel("Repo name")).toHaveValue(expected); // the next free name
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(moreButton(page, expected)).toBeVisible({ timeout: 15_000 });
};

// New songs go to GitHub only from the "Not backed up" list in Settings.
const uploadAll = async (page: import("@playwright/test").Page, count: number) => {
  await librariesShown(page);
  await page.getByText(`Not backed up (${count})`).click();
  await page.getByRole("button", { name: "Upload all" }).click();
};

test("backs a library up to GitHub and restores it on a fresh device", async ({ page }) => {
  await signInWithFake(page);
  await importFiles(page, [
    { name: "Alpha.wav", buffer: wavBuffer(3) },
    { name: "Beta.wav", buffer: wavBuffer(4, 5) },
  ]);

  await openSettings(page);
  await librariesShown(page);
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect(page.getByText("Up to date.")).toBeVisible({ timeout: 15_000 });
  expect(await remoteTitles(page)).toEqual([]); // a plain sync uploads nothing new

  await uploadAll(page, 2);
  await expect(page.getByText("Synced 2.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Every song is backed up.")).toBeVisible();
  expect(await remoteTitles(page)).toEqual(["Alpha", "Beta"]);
  expect(await page.evaluate((r) => (window as any).__fake.repos.get(r).private, REPO)).toBe(true);

  await wipeDevice(page);
  await page.getByRole("button", { name: "Download" }).click();
  await expect(page.getByText("Synced 2.")).toBeVisible({ timeout: 20_000 });

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
  await expect(page.getByText("Up to date.")).toBeVisible({ timeout: 15_000 });
});

test("waits out a GitHub rate limit and carries on by itself", async ({ page }) => {
  await signInWithFake(page);
  await importFiles(page, [{ name: "Gamma.wav", buffer: wavBuffer(2) }]);
  await openSettings(page);
  await librariesShown(page);

  await page.evaluate(() => (window as any).__fake.limitNextWrites(1));
  await uploadAll(page, 1);

  await expect(page.getByText(/limit reached\. Retrying at/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Synced 1.")).toBeVisible({ timeout: 20_000 });
  expect(await remoteTitles(page)).toEqual(["Gamma"]);
});

test("removing the token keeps the music and hides the backup", async ({ page }) => {
  await signInWithFake(page);
  await importFiles(page, [{ name: "Delta.wav", buffer: wavBuffer(2) }]);
  await openSettings(page);

  await page.getByRole("button", { name: "Remove token" }).click();
  const ask = page.locator("[data-sonner-toast]", { hasText: "Remove the GitHub token" });
  await ask.getByRole("button", { name: "Remove", exact: true }).click();

  await expect(page.getByText("Not signed in")).toBeVisible();
  await expect(page.getByText("GitHub backup")).toBeHidden();

  // The notice can be closed with the × at its top right.
  const notice = page.locator("[data-sonner-toast]", { hasText: "Token removed" });
  const close = notice.getByRole("button", { name: "Close toast" });
  const [box, button] = [(await notice.boundingBox())!, (await close.boundingBox())!];
  expect(button.x + button.width / 2).toBeGreaterThan(box.x + box.width / 2);
  expect(button.y).toBeLessThan(box.y + box.height / 2);
  await close.click();
  await expect(notice).toBeHidden();
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
  await openSettings(page);
  await uploadAll(page, 2);
  await expect(page.getByText("Synced 2.")).toBeVisible({ timeout: 20_000 });
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

  await openSettings(page);
  await expect(page.getByText("1 only on GitHub.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect(page.getByText("Up to date.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Download" }).click();
  await expect(page.getByText("Synced 1.")).toBeVisible({ timeout: 20_000 });
  await page.goto("/#/library");
  await expect(page.getByText("1 songs")).toBeVisible();
  await expect(page.getByText("Kept", { exact: true })).toBeVisible();
});

test("carries on with unfinished sync steps when the app opens signed in", async ({ page }) => {
  const { tryWithoutLogin, installFakeGithub } = await import("./fixtures");
  await tryWithoutLogin(page);
  await importFiles(page, [{ name: "Leftover.wav", buffer: wavBuffer(2) }]);

  // As if the app was closed in the middle of an upload.
  await page.evaluate(async () => {
    const { default: db } = await import(/* @vite-ignore */ "/src/services/db.ts");
    const [song] = await db.songs.toArray();
    await db.outbox.add({
      id: `push:${song.id}`, op: "push", trackId: song.id, library: "music-library", status: "running",
      attempts: 0, nextAttemptAt: 0, createdAt: Date.now(),
    });
  });

  await installFakeGithub(page);
  await openSettings(page);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("GitHub access token").fill("good-token");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect.poll(() => remoteTitles(page).catch(() => []), { timeout: 20_000 }).toEqual(["Leftover"]);
  await openSettings(page);
  await expect(page.getByText("Synced 1.")).toBeVisible();
});

test("settings sections start folded and stay open once opened", async ({ page }) => {
  await signInWithFake(page);
  await page.goto("/#/settings");
  const sync = page.getByRole("button", { name: "Sync", exact: true });
  await expect(sync).toBeHidden();

  await page.getByRole("heading", { name: "GitHub backup" }).click();
  await expect(sync).toBeVisible();

  await page.goto("/#/library");
  await page.goto("/#/settings");
  await expect(sync).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle dev tools" })).toBeVisible();
});

test("uploads just the chosen song and nothing after import", async ({ page }) => {
  await signInWithFake(page);
  await importFiles(page, [
    { name: "Small.wav", buffer: wavBuffer(1) },
    { name: "Huge.wav", buffer: wavBuffer(6, 5) },
  ]);
  await page.waitForTimeout(4000); // past the delay of automatic playlist sync
  expect(await remoteTitles(page).catch(() => [])).toEqual([]);

  await openSettings(page);
  await page.getByText("Not backed up (2)").click();
  await expect(page.getByText("46.9 KB")).toBeVisible(); // sizes help leave big files out
  await page.getByRole("button", { name: "Upload Small" }).click();
  await expect(page.getByText("Synced 1.")).toBeVisible({ timeout: 20_000 });

  expect(await remoteTitles(page)).toEqual(["Small"]);
  await expect(page.getByText("Not backed up (1)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload Huge" })).toBeVisible();
});

test("uploads into a chosen library and shares only that one", async ({ page, context }) => {
  const { routeRawToFake } = await import("./fixtures");
  const SHARED = `${REPO}-2`;
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signInWithFake(page);
  await routeRawToFake(context, page);
  await importFiles(page, [
    { name: "Mine.wav", buffer: wavBuffer(2) },
    { name: "For Friends.wav", buffer: wavBuffer(2, 5) },
  ]);
  await createLibrary(page, SHARED);

  // One song into each library.
  await openSettings(page);
  await librariesShown(page);
  await page.getByText("Not backed up (2)").click();
  await page.getByLabel("Library", { exact: true }).selectOption(SHARED);
  await page.getByRole("button", { name: "Upload For Friends" }).click();
  await expect(page.getByText("Synced 1.")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Library", { exact: true }).selectOption(REPO);
  await page.getByRole("button", { name: "Upload Mine" }).click();
  await expect(page.getByText("Every song is backed up.")).toBeVisible({ timeout: 20_000 });
  const titlesIn = (repo: string) =>
    page.evaluate((r) => {
      const index = JSON.parse((window as any).__fake.fileText(r, "index.json"));
      return index.tracks.map((t: any) => t.title);
    }, repo);
  expect(await titlesIn(SHARED)).toEqual(["For Friends"]);
  expect(await titlesIn(REPO)).toEqual(["Mine"]);

  // Share only the second library, after a short warning.
  await page.goto("/#/explore");
  await libraryMenu(page, SHARED, "Make public");
  const warning = page.locator("[data-sonner-toast]", { hasText: `Make ${SHARED} public?` });
  await expect(warning).toContainText("Anyone with the link");
  await warning.getByRole("button", { name: "Make public" }).click();
  const card = page.locator("li", { has: moreButton(page, SHARED) });
  await expect(card.getByLabel("Public")).toBeVisible({ timeout: 15_000 });
  const isPrivate = (repo: string) =>
    page.evaluate((r) => (window as any).__fake.repos.get(r).private, repo);
  expect(await isPrivate(SHARED)).toBe(false);
  expect(await isPrivate(REPO)).toBe(true);
  expect(await isPrivate("music-library-home")).toBe(true);
  await moreButton(page, REPO).click();
  await expect(page.getByRole("menuitem", { name: "Copy link" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await libraryMenu(page, SHARED, "Copy link");
  await expect(page.getByText("Link copied")).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(new RegExp(`#/explore/tester/${SHARED}$`));

  // The link opens the shared songs (same page, so the test GitHub stays).
  await page.evaluate((url) => (window.location.href = url), link);
  await expect(page.getByText("For Friends", { exact: true })).toBeVisible({ timeout: 15_000 });
});

test("deleting a song that is not backed up asks in the app, and Cancel keeps it", async ({ page }) => {
  const { tryWithoutLogin, songRow } = await import("./fixtures");
  await tryWithoutLogin(page);
  await importFiles(page, [{ name: "Keep Me.wav", buffer: wavBuffer(2) }]);

  const ask = async () => {
    await songRow(page, "Keep Me").locator('[aria-haspopup="menu"]').click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    return page.locator("[data-sonner-toast]", { hasText: "Delete “Keep Me”?" });
  };

  const first = await ask();
  await first.getByRole("button", { name: "Cancel" }).click();
  await expect(first).toHaveCount(0); // Cancel closes the notice
  await expect(page.getByText("1 songs")).toBeVisible();

  await (await ask()).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("0 songs")).toBeVisible();
});

test("renames a backed-up song, saves its file, and deletes a library", async ({ page }) => {
  const { songRow } = await import("./fixtures");
  const SECOND = `${REPO}-2`;
  await signInWithFake(page);
  await importFiles(page, [{ name: "Old Name.wav", buffer: wavBuffer(2) }]);
  await openSettings(page);
  await uploadAll(page, 1);
  await expect(page.getByText("Every song is backed up.")).toBeVisible({ timeout: 20_000 });

  // Rename: the new name reaches GitHub without sending the file again.
  await page.goto("/#/library");
  await songRow(page, "Old Name").locator('[aria-haspopup="menu"]').click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename song" });
  await dialog.getByLabel("Title").fill("New Name");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("New Name", { exact: true })).toBeVisible();
  await expect.poll(() => remoteTitles(page), { timeout: 15_000 }).toEqual(["New Name"]);

  // Download file: the original file, named after the song.
  await songRow(page, "New Name").locator('[aria-haspopup="menu"]').click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download file" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("New Name.wav");

  // Delete a library: a short warning; the last one cannot be deleted.
  await createLibrary(page, SECOND);
  await libraryMenu(page, SECOND, "Delete");
  const ask = page.getByRole("dialog", { name: `Delete ${SECOND}?` });
  await expect(ask).toContainText("can't be undone");
  await ask.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(moreButton(page, SECOND)).toHaveCount(0, { timeout: 15_000 });
  expect(await page.evaluate((r) => (window as any).__fake.repos.has(r), SECOND)).toBe(false);
  expect(await remoteTitles(page)).toEqual(["New Name"]);

  // Rename: only the shown name changes; the repo and its link stay.
  await moreButton(page, REPO).click();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const rename = page.getByRole("dialog", { name: "Rename library" });
  await rename.getByLabel("Name").fill("Family Songs");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: "Family Songs" })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate((r) => (window as any).__fake.repos.has(r), REPO)).toBe(true);
  await page.getByRole("link", { name: "Family Songs" }).click();
  await expect(page.getByText("Family Songs", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(`${REPO} · 1 tracks`)).toBeVisible();
});
