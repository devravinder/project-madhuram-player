import { GithubApi } from "@/services/github/api";
import {
  createEmptyIndex,
  parseIndex,
  serializeIndex,
} from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";
import { uploadTrack } from "@/services/sync/upload";
import type { TrackMeta } from "@/services/storage/types";
import { FakeGithub } from "@/testing/fakeGithub";
import { makeFile, randomBytes } from "@/testing/files";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanGithubLibrary } from "./cleanGithub";

const NAME = "music-library";
const SHARD = `${NAME}-part-1`;
const DAY = 24 * 60 * 60 * 1000;
const START = new Date("2026-01-01T00:00:00.000Z");
const NOW = START.getTime() + 3 * DAY;
const noSleep = async () => {};

const meta = (id: string): TrackMeta => ({
  id,
  kind: "audio",
  title: `Song ${id}`,
  artist: "",
  album: "",
  duration: 1,
  mime: "audio/mpeg",
  bytes: 0,
  addedAt: START.toISOString(),
  updatedAt: START.toISOString(),
});

let fake: FakeGithub;
let library: LibraryRepo;

const index = () => parseIndex(fake.fileText(NAME, "index.json")!);
const pathsOf = (repo: string, id: string) =>
  fake.paths(repo).filter((p) => p.includes(id));
const upload = (id: string, size: number, seed = 1) =>
  uploadTrack(
    library,
    meta(id),
    { media: makeFile(`${id}.mp3`, randomBytes(size, seed)) },
    { sleep: noSleep },
  );

beforeEach(async () => {
  fake = new FakeGithub();
  fake.setClock(START);
  await fake.seedRepo(NAME, {
    "index.json": serializeIndex(
      createEmptyIndex(NAME, { maxFileBytes: 100, maxRepoBytes: 250 }),
    ),
  });
  const api = new GithubApi(fake.token, fake.fetch);
  library = new LibraryRepo(api, fake.login, NAME, "main", noSleep);
});

describe("cleanGithubLibrary", () => {
  it("removes files of songs that are not in the library and fixes the space used", async () => {
    await upload("aa1", 80);
    await fake.pushFiles(NAME, {
      "data/zz/zz9/media.0": randomBytes(60, 9),
      "manifests/zz9.json": "{}",
    });

    const result = await cleanGithubLibrary(library, NOW);

    expect(result).toEqual({ files: 2, bytes: 62 });
    expect(pathsOf(NAME, "zz9")).toEqual([]);
    expect(pathsOf(NAME, "aa1")).toHaveLength(2); // manifest + part
    expect(index().repos[0].usedBytes).toBe(80);
  });

  it("removes unused parts from overflow repos too", async () => {
    await upload("aa1", 200);
    await upload("bb2", 100, 2); // goes to the overflow repo
    expect(pathsOf(SHARD, "bb2").length).toBeGreaterThan(0);
    // An upload cut off after its parts reached the overflow repo.
    await fake.pushFiles(SHARD, { "data/cc/cc3/media.0": randomBytes(40, 3) });

    const result = await cleanGithubLibrary(library, NOW);

    expect(result.files).toBe(1);
    expect(pathsOf(SHARD, "cc3")).toEqual([]);
    expect(pathsOf(SHARD, "bb2").length).toBeGreaterThan(0);
    expect(index().repos.find((r) => r.name === SHARD)?.usedBytes).toBe(100);
  });

  it("removes parts a song's manifest does not use", async () => {
    await upload("aa1", 80);
    await fake.pushFiles(NAME, { "data/aa/aa1/media.7": randomBytes(30, 4) });

    expect((await cleanGithubLibrary(library, NOW)).files).toBe(1);
    expect(pathsOf(NAME, "aa1/")).toEqual(["data/aa/aa1/media.0"]);
  });

  it("leaves files changed in the last day, which may be an upload in progress", async () => {
    fake.setClock(new Date(NOW - 60 * 60 * 1000));
    await fake.pushFiles(NAME, { "data/zz/zz9/media.0": randomBytes(60, 9) });

    expect(await cleanGithubLibrary(library, NOW)).toEqual({
      files: 0,
      bytes: 0,
    });
    expect(pathsOf(NAME, "zz9")).toHaveLength(1);
  });

  it("does not commit when there is nothing to clean", async () => {
    await upload("aa1", 80);
    const commits = fake.commitCount(NAME);

    await cleanGithubLibrary(library, NOW);

    expect(fake.commitCount(NAME)).toBe(commits);
  });
});
