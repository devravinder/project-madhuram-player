import { FakeGithub } from "@/testing/fakeGithub";
import { describe, expect, it } from "vitest";
import { GithubApi } from "./api";
import { parseIndex } from "./indexTypes";
import {
  homeInfo,
  LibraryNameTakenError,
  openHome,
  openLibrary,
  saveLibrary,
  setDefaultLibrary,
  suggestLibraryName,
} from "./session";

const config = { maxFileBytes: 50, maxRepoBytes: 800 };
const noSleep = async () => {};
const HOME = "project-music-home";
const LIB = "project-music-files";

const optionsFor = (fake: FakeGithub, fetchFn: typeof fetch = fake.fetch) => ({
  api: new GithubApi(fake.token, fetchFn),
  login: fake.login,
  config,
  sleep: noSleep,
});

describe("openHome", () => {
  it("creates a private home listing the first library", async () => {
    const fake = new FakeGithub();
    const home = await openHome(optionsFor(fake), HOME, LIB);

    const { index } = await home.read();
    expect(index.role).toBe("home");
    expect(homeInfo(index)).toEqual({ libraries: [LIB], defaultLibrary: LIB });
    expect(fake.repos.get(HOME)?.private).toBe(true);
  });

  it("reuses the home on the next sign-in", async () => {
    const fake = new FakeGithub();
    await openHome(optionsFor(fake), HOME, LIB);
    const commits = fake.commitCount(HOME);

    await openHome(optionsFor(fake), HOME, LIB);
    expect(fake.commitCount(HOME)).toBe(commits);
  });

  it("never takes a music library as the home", async () => {
    const fake = new FakeGithub();
    await openLibrary(optionsFor(fake), HOME);

    await expect(openHome(optionsFor(fake), HOME, LIB)).rejects.toBeInstanceOf(LibraryNameTakenError);
  });
});

describe("openLibrary", () => {
  it("creates a private library that can be read back", async () => {
    const fake = new FakeGithub();
    const library = await openLibrary(optionsFor(fake), LIB);

    expect((await library.read()).index).toMatchObject({ role: "library", config });
    expect(fake.repos.get(LIB)?.private).toBe(true);
  });

  it("reports a name that belongs to another project", async () => {
    const fake = new FakeGithub();
    await fake.seedRepo(LIB, { "app.ts": "code" });

    await expect(openLibrary(optionsFor(fake), LIB)).rejects.toBeInstanceOf(LibraryNameTakenError);
    expect(fake.paths(LIB)).toEqual(["app.ts"]);
  });

  it("never takes the home as a library", async () => {
    const fake = new FakeGithub();
    await openHome(optionsFor(fake), HOME, LIB);

    await expect(openLibrary(optionsFor(fake), HOME)).rejects.toBeInstanceOf(LibraryNameTakenError);
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

    const library = await openLibrary(optionsFor(fake, cachingFetch), LIB);
    expect((await library.read()).index.config).toEqual(config);
    expect(await library.readText("playlists.json")).toBeUndefined();
  });
});

describe("the list of libraries", () => {
  it("adds a library, keeps the default, and can change it", async () => {
    const fake = new FakeGithub();
    const home = await openHome(optionsFor(fake), HOME, LIB);

    expect(await saveLibrary(home, `${LIB}-2`)).toEqual({
      libraries: [LIB, `${LIB}-2`],
      defaultLibrary: LIB,
    });
    expect(await setDefaultLibrary(home, `${LIB}-2`)).toMatchObject({ defaultLibrary: `${LIB}-2` });
    expect(parseIndex(fake.fileText(HOME, "index.json")!).defaultLibrary).toBe(`${LIB}-2`);
  });

  it("replaces a taken name, default included", async () => {
    const fake = new FakeGithub();
    const home = await openHome(optionsFor(fake), HOME, LIB);

    expect(await saveLibrary(home, "my-music", LIB)).toEqual({
      libraries: ["my-music"],
      defaultLibrary: "my-music",
    });
  });

  it("suggests the next free name", () => {
    expect(suggestLibraryName(LIB, [])).toBe(LIB);
    expect(suggestLibraryName(LIB, [LIB])).toBe(`${LIB}-2`);
    expect(suggestLibraryName(LIB, [LIB, `${LIB}-2`])).toBe(`${LIB}-3`);
  });
});
