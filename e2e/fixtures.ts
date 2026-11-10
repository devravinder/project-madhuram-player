import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

// Fails a test on any uncaught page error, and closes the "ready to work
// offline" notice whenever it appears, since it can cover what is clicked.
export const test = base.extend({
  // Any request to real GitHub fails the test; only the in-page fake answers.
  context: async ({ context }, use) => {
    const leaks: string[] = [];
    await context.route(/^https:\/\/([a-z0-9-]+\.)*(github\.com|githubusercontent\.com)\//, (route) => {
      leaks.push(route.request().url());
      return route.abort("blockedbyclient");
    });
    await use(context);
    expect(leaks, "requests that tried to reach real GitHub").toEqual([]);
  },
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addLocatorHandler(page.getByRole("button", { name: "Close" }), (close) =>
      close.click(),
    );
    await use(page);
    expect(errors, "uncaught page errors").toEqual([]);
  },
});

export { expect };

export function wavBuffer(seconds: number, tone = 8): Buffer {
  const rate = 8000;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) buf[44 + i] = 128 + Math.round(40 * Math.sin(i / tone));
  return buf;
}

export async function tryWithoutLogin(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try without login" }).click();
  await expect(page.getByLabel("GitHub access token")).toBeHidden();
}

export async function importFiles(page: Page, files: { name: string; buffer: Buffer; mimeType?: string }[]) {
  await page.goto("/#/import");
  await page.setInputFiles(
    'input[type="file"]',
    files.map((file) => ({ mimeType: "audio/wav", ...file })),
  );
  await page.waitForURL("**/#/library");
}

// Replaces api.github.com inside the page with the in-memory fake GitHub.
// Must run again after a reload.
export async function installFakeGithub(page: Page) {
  await page.evaluate(async () => {
    const path = "/src/testing/fakeGithub.ts";
    const { FakeGithub } = await import(/* @vite-ignore */ path);
    const w = window as any;
    w.__fake ??= new FakeGithub();
    const real = window.fetch.bind(window);
    window.fetch = (input, init) =>
      String(input).startsWith("https://api.github.com")
        ? w.__fake.fetch(input, init)
        : real(input, init);
  });
}

export async function signInWithFake(page: Page) {
  await page.goto("/");
  await installFakeGithub(page);
  await page.getByLabel("GitHub access token").fill("good-token");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByLabel("GitHub access token")).toBeHidden();
}

// raw.githubusercontent.com is answered from the fake, the way GitHub serves
// public files. Media elements fetch through the browser, so this is a route.
export async function routeRawToFake(context: BrowserContext, page: Page) {
  const state = { offline: false, missing: [] as string[] };
  await context.route("https://raw.githubusercontent.com/**", async (route) => {
    if (state.offline) return route.abort("internetdisconnected");
    const [, , repo, , ...rest] = new URL(route.request().url()).pathname.split("/");
    const path = decodeURIComponent(rest.join("/"));
    if (state.missing.some((part) => path.includes(part))) {
      return route.fulfill({ status: 404, body: "404: Not Found" });
    }
    const base64 = await page.evaluate(
      ([name, file]) => {
        const fake = (window as any).__fake;
        if (!fake?.repos.get(name) || fake.repos.get(name).private) return null;
        const bytes: Uint8Array | undefined = fake.fileBytes(name, file);
        if (!bytes) return null;
        let text = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
          text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        return btoa(text);
      },
      [repo, path],
    );
    if (!base64) return route.fulfill({ status: 404, body: "404: Not Found" });
    return route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
      body: Buffer.from(base64, "base64"),
    });
  });
  return state;
}

// Publishes tracks to a public library owned by the fake's user.
export async function seedPublicLibrary(
  page: Page,
  repo: string,
  tracks: { id: string; title: string; seconds: number }[],
) {
  await installFakeGithub(page);
  await page.evaluate(
    async ({ repo, tracks }) => {
      const load = (path: string) => import(/* @vite-ignore */ path);
      const { GithubApi } = await load("/src/services/github/api.ts");
      const { findOrCreateLibrary } = await load("/src/services/github/discovery.ts");
      const { LibraryRepo } = await load("/src/services/github/library.ts");
      const { uploadTrack } = await load("/src/services/sync/upload.ts");
      const fake = (window as any).__fake;

      const api = new GithubApi(fake.token, fake.fetch);
      const found = await findOrCreateLibrary(
        api, fake.login, repo,
        // Parts of 100 KB: an 8 s track is one part, a 24 s track is two.
        { maxFileBytes: 100_000, maxRepoBytes: 10_000_000 },
        async () => {},
      );
      const library = new LibraryRepo(api, fake.login, repo, found.branch);

      for (const track of tracks) {
        const rate = 8000, n = rate * track.seconds;
        const buf = new ArrayBuffer(44 + n), v = new DataView(buf);
        const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
        w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true);
        v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true);
        v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true);
        for (let i = 0; i < n; i++) v.setUint8(44 + i, 128 + Math.round(40 * Math.sin(i / 8)));

        await uploadTrack(
          library,
          {
            id: track.id, kind: "audio", title: track.title, artist: "Shared", album: "Public",
            duration: track.seconds, mime: "audio/wav", bytes: 0,
            addedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
          },
          { media: new File([buf], `${track.id}.wav`, { type: "audio/wav" }) },
          { sleep: async () => {} },
        );
      }
      fake.repos.get(repo).private = false;
      (window as any).__publicLibrary = library;
    },
    { repo, tracks },
  );
}

export type MediaState = { src: string; paused: boolean; time: number; title?: string };

export function mediaState(page: Page): Promise<MediaState> {
  return page.evaluate(async () => {
    const { mediaElement } = await import(/* @vite-ignore */ "/src/services/mediaElement.ts");
    return {
      src: mediaElement.src,
      paused: mediaElement.paused,
      time: mediaElement.currentTime,
      title: navigator.mediaSession?.metadata?.title,
    };
  });
}

// Waits until the player has actually advanced, not just been told to play.
export async function expectPlaying(page: Page, src: RegExp) {
  await expect
    .poll(async () => {
      const state = await mediaState(page);
      return !state.paused && state.time > 0.3 && src.test(state.src);
    }, { timeout: 15_000 })
    .toBe(true);
}

export const songRow = (page: Page, title: string) =>
  page.locator("div.group").filter({ has: page.getByText(title, { exact: true }) });