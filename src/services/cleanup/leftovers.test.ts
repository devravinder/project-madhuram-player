import { GithubApi } from "@/services/github/api";
import {
  findOrCreateLibrary,
  LIBRARY_DESCRIPTION,
} from "@/services/github/discovery";
import {
  createHomeIndex,
  parseIndex,
  serializeIndex,
} from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";
import { SHARD_MARKER_PATH } from "@/services/github/shards";
import { FakeGithub } from "@/testing/fakeGithub";
import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteLeftoverRepos,
  findLeftoverRepos,
  KEEP_UNFOLLOWS_MS,
  pruneUnfollows,
} from "./leftovers";

const HOME = "music-library-home";
const LIBRARY = "music-library";
const CONFIG = { maxFileBytes: 100, maxRepoBytes: 1000 };
const noSleep = async () => {};

let fake: FakeGithub;
let api: GithubApi;
let home: LibraryRepo;
let library: LibraryRepo;

const marker = (owner: string) =>
  JSON.stringify({ app: "madhuram", role: "shard", library: owner });

async function seedShard(name: string, owner: string) {
  await fake.seedRepo(name, { [SHARD_MARKER_PATH]: marker(owner) });
  fake.repos.get(name)!.description = `${LIBRARY_DESCRIPTION}, part 1`;
}

beforeEach(async () => {
  fake = new FakeGithub();
  api = new GithubApi(fake.token, fake.fetch);
  await fake.seedRepo(HOME, {
    "index.json": serializeIndex(createHomeIndex(HOME, CONFIG, LIBRARY)),
  });
  home = new LibraryRepo(api, fake.login, HOME, "main", noSleep);
  await findOrCreateLibrary(api, fake.login, LIBRARY, CONFIG, noSleep);
  library = new LibraryRepo(api, fake.login, LIBRARY, "main", noSleep);
});

describe("findLeftoverRepos", () => {
  it("lists music repos no library uses, and nothing else", async () => {
    await findOrCreateLibrary(api, fake.login, "old-music", CONFIG, noSleep); // not listed
    await seedShard("old-music-part-1", "old-music");
    await seedShard(`${LIBRARY}-part-1`, LIBRARY); // belongs to a listed library
    await fake.seedRepo("notes", { "README.md": "hi" });
    await fake.seedRepo("look-alike", { "README.md": "hi" });
    fake.repos.get("look-alike")!.description = LIBRARY_DESCRIPTION; // no index

    expect(await findLeftoverRepos(home, [library], [LIBRARY])).toEqual([
      "old-music",
      "old-music-part-1",
    ]);
  });
});

describe("deleteLeftoverRepos", () => {
  it("deletes only chosen repos that are still unused", async () => {
    await findOrCreateLibrary(api, fake.login, "old-music", CONFIG, noSleep);
    await seedShard("old-music-part-1", "old-music");

    // old-music became a library again since the scan: it is in use now.
    const inUse = await deleteLeftoverRepos(
      home,
      [library],
      [LIBRARY, "old-music"],
      ["old-music", LIBRARY],
    );
    expect(inUse).toEqual({ deleted: [], failed: [], remaining: [] });
    expect(fake.repos.has("old-music")).toBe(true);

    const result = await deleteLeftoverRepos(
      home,
      [library],
      [LIBRARY],
      ["old-music-part-1"],
    );
    expect(result).toEqual({
      deleted: ["old-music-part-1"],
      failed: [],
      remaining: ["old-music"],
    });
    expect(fake.repos.has("old-music-part-1")).toBe(false);
    expect(fake.repos.has(LIBRARY)).toBe(true);
  });
});

describe("pruneUnfollows", () => {
  it("forgets unfollows older than the keep time, and keeps follows", async () => {
    const now = Date.parse("2026-06-01T00:00:00.000Z");
    const old = new Date(now - KEEP_UNFOLLOWS_MS - 1000).toISOString();
    const recent = new Date(now - 1000).toISOString();
    await home.update((current) => ({
      message: "seed",
      index: {
        ...current,
        sources: [
          { address: "a/old", updatedAt: old, removed: true },
          { address: "b/recent", updatedAt: recent, removed: true },
          { address: "c/followed", updatedAt: old },
        ],
      },
    }));

    expect(await pruneUnfollows(home, now)).toBe(1);
    const sources = parseIndex(fake.fileText(HOME, "index.json")!).sources;
    expect(sources.map((s) => s.address)).toEqual(["b/recent", "c/followed"]);

    const commits = fake.commitCount(HOME);
    expect(await pruneUnfollows(home, now)).toBe(0);
    expect(fake.commitCount(HOME)).toBe(commits);
  });
});
