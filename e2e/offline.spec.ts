import {
  expect,
  expectPlaying,
  importFiles,
  mediaState,
  routeRawToFake,
  seedPublicLibrary,
  songRow,
  test,
  tryWithoutLogin,
  wavBuffer,
} from "./fixtures";

test("imported tracks play with no connection", async ({ page, context }) => {
  await tryWithoutLogin(page);
  await importFiles(page, [
    { name: "Morning.wav", buffer: wavBuffer(20) },
    { name: "Evening.wav", buffer: wavBuffer(20, 5) },
  ]);
  await expect(page.getByText("2 songs")).toBeVisible();

  await context.setOffline(true);
  await songRow(page, "Evening").click();

  await expectPlaying(page, /^blob:/);
  expect((await mediaState(page)).title).toBe("Evening");
});

test("a downloaded public track plays offline; an unsaved one explains why not", async ({ page, context }) => {
  const raw = await routeRawToFake(context, page);
  await tryWithoutLogin(page);
  await seedPublicLibrary(page, "music-share", [
    { id: "saved1", title: "Keep Me", seconds: 10 },
    { id: "other1", title: "Stream Only", seconds: 12 }, // different bytes from Keep Me
  ]);
  await page.goto("/#/explore");
  await page.getByLabel("Library address").fill("tester/music-share");
  await page.getByRole("button", { name: "Follow" }).click();
  await expect(page.getByText("2 tracks")).toBeVisible();

  await page.getByRole("button", { name: "Download Keep Me" }).click();
  await expect(page.getByRole("img", { name: "Saved on this device" })).toBeVisible();

  await context.setOffline(true);
  raw.offline = true;

  await songRow(page, "Stream Only").click();
  await expect(page.getByText(/Cannot reach GitHub/).first()).toBeVisible();
  expect((await mediaState(page)).paused).toBe(true);

  await songRow(page, "Keep Me").click();
  await expectPlaying(page, /^blob:/);
});