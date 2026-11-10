import { FakeGithub } from "@/testing/fakeGithub";
import { describe, expect, it } from "vitest";
import { LibraryNameTakenError, openLibrary } from "./session";

const config = { maxFileBytes: 50, maxRepoBytes: 800 };
const noSleep = async () => {};

const open = (fake: FakeGithub, repoName = "project-music-files") =>
  openLibrary({
    token: fake.token,
    login: fake.login,
    repoName,
    config,
    fetchFn: fake.fetch,
    sleep: noSleep,
  });

describe("openLibrary", () => {
  it("creates the library for a new account and can read it back", async () => {
    const fake = new FakeGithub();
    const { library, status } = await open(fake);

    expect(status).toBe("created");
    expect((await library.read()).index.config).toEqual(config);
  });

  it("reuses the library on the next sign-in", async () => {
    const fake = new FakeGithub();
    await open(fake);

    expect((await open(fake)).status).toBe("reused");
  });

  it("reports a name that belongs to another project", async () => {
    const fake = new FakeGithub();
    await fake.seedRepo("project-music-files", { "app.ts": "code" });

    await expect(open(fake)).rejects.toBeInstanceOf(LibraryNameTakenError);
  });

  it("works with another repo name after a clash", async () => {
    const fake = new FakeGithub();
    await fake.seedRepo("project-music-files", { "app.ts": "code" });

    const { status } = await open(fake, "my-music");
    expect(status).toBe("created");
    expect(fake.paths("project-music-files")).toEqual(["app.ts"]);
  });

  // Regression: GitHub sends max-age=60, so a browser cached the branch
  // ref of the fresh repo (README only) and the next read got a 404 for
  // index.json. Requests must opt out of the HTTP cache.
  it("reads a new library through a browser-like HTTP cache", async () => {
    const fake = new FakeGithub();
    const cache = new Map<string, Response>();
    const cachingFetch: typeof fetch = async (input, init) => {
      const key = String(input);
      const cacheable = (init?.method ?? "GET") === "GET" && init?.cache !== "no-store";
      const hit = cacheable ? cache.get(key) : undefined;
      if (hit) return hit.clone();
      const response = await fake.fetch(input, init);
      if (cacheable && response.ok) cache.set(key, response.clone());
      return response;
    };

    const { library } = await openLibrary({
      token: fake.token,
      login: fake.login,
      repoName: "project-music-files",
      config,
      fetchFn: cachingFetch,
      sleep: noSleep,
    });
    expect((await library.read()).index.config).toEqual(config);
    expect(await library.readText("playlists.json")).toBeUndefined();
  });

  it("does not ask for files that a new library does not have yet", async () => {
    const fake = new FakeGithub();
    const { library } = await open(fake);
    await library.readText("playlists.json");

    expect(fake.requests.filter((r) => r.includes("/contents/"))).toEqual([]);
  });
});