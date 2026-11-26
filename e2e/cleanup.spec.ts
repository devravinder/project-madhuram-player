import { expect, openSettings, signInWithFake, test } from "./fixtures";

test("clean up runs once at a time and shows when it last ran", async ({ page }) => {
  await signInWithFake(page);
  await openSettings(page);
  await page.locator("summary", { has: page.getByRole("heading", { name: "Storage" }) }).click();

  // An unused file left on the device, saved two days ago.
  await page.evaluate(async () => {
    const { default: db } = await import(/* @vite-ignore */ "/src/services/db.ts");
    await db.files.put({
      id: "left-over.mp3",
      data: new File([new Uint8Array(2048)], "left-over.mp3"),
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
  });

  const button = page.getByRole("button", { name: /Clean up|Cleaning/ });
  await button.click();
  await expect(page.getByText(/^Last run .+\. Freed 2(\.0)? KB\.$/)).toBeVisible({ timeout: 15_000 });
  await expect(button).toBeEnabled();
  await expect(button).toHaveText("Clean up");

  // Still shown after leaving the page and coming back.
  await page.goto("/#/library");
  await openSettings(page);
  await expect(page.getByText(/^Last run /)).toBeVisible();
});
