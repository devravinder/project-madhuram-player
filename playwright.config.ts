import { defineConfig } from "@playwright/test";

const PORT = 5199;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  // One dev server and real media playback; running one at a time is steadier.
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The installed Chrome, so no browser download is needed.
    channel: "chrome",
    viewport: { width: 700, height: 900 },
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
    trace: "retain-on-failure",
    // Requests a service worker makes are not seen by page routing, so they
    // could reach real GitHub. Streaming is covered by unit tests instead.
    serviceWorkers: "block",
  },
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});