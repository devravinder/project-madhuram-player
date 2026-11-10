import {
  expect,
  expectPlaying,
  routeRawToFake,
  seedPublicLibrary,
  songRow,
  test,
  tryWithoutLogin,
} from "./fixtures";

test("plays a public library without login: streams small files, downloads split ones", async ({ page, context }) => {
  const raw = await routeRawToFake(context, page);
  await tryWithoutLogin(page);
  await seedPublicLibrary(page, "music-share", [
    { id: "stream1", title: "Stream Song", seconds: 8 },
    { id: "split1", title: "Split Song", seconds: 24 },
    { id: "gone1", title: "Gone Song", seconds: 8 },
  ]);

  await page.goto("/#/explore");
  await page.getByLabel("Library address").fill("https://github.com/Tester/Music-Share");
  await page.getByRole("button", { name: "Follow" }).click();
  await expect(page.getByText("3 tracks")).toBeVisible();

  await songRow(page, "Stream Song").click();
  await expectPlaying(page, /^https:\/\/raw\.githubusercontent\.com\//);

  await songRow(page, "Split Song").click();
  await expectPlaying(page, /^blob:/);

  // Still listed, but its files are gone.
  raw.missing.push("gone1");
  await songRow(page, "Gone Song").click();
  await expect(page.getByText(/Unable to play|File not found/).first()).toBeVisible();

  // The owner removes it from the library: it leaves the list.
  await page.evaluate(async () => {
    await (window as any).__publicLibrary.update((index: any) => ({
      message: "remove",
      index: {
        ...index,
        tracks: index.tracks.map((t: any) => (t.id === "gone1" ? { ...t, deleted: true } : t)),
      },
    }));
  });
  await page.goto("/#/explore");
  await page.getByRole("link", { name: "tester/music-share" }).click();
  await expect(page.getByText("2 tracks")).toBeVisible();
  await expect(songRow(page, "Gone Song")).toHaveCount(0);

  await page.goto("/#/explore");
  await page.getByRole("button", { name: "Unfollow tester/music-share" }).click();
  await expect(page.getByText("You are not following any library yet.")).toBeVisible();
});

test("tells the listener when an address is not a public library", async ({ page, context }) => {
  await routeRawToFake(context, page);
  await tryWithoutLogin(page);
  await page.goto("/#/explore");

  await page.getByLabel("Library address").fill("not an address");
  await page.getByRole("button", { name: "Follow" }).click();
  await expect(page.getByText(/Enter an address like owner\/repo/)).toBeVisible();

  await page.getByLabel("Library address").fill("someone/missing-library");
  await page.getByRole("button", { name: "Follow" }).click();
  await expect(page.getByText(/No music library found at someone\/missing-library/)).toBeVisible();
});