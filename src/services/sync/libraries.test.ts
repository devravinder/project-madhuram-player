import db from "@/services/db";
import { GithubApi } from "@/services/github/api";
import { parseIndex } from "@/services/github/indexTypes";
import { openHome, openLibrary } from "@/services/github/session";
import { setLibraryPrivate } from "@/services/github/visibility";
import { PublicLibrary } from "@/services/public/publicLibrary";
import { deviceProvider } from "@/services/storage/deviceProvider";
import type { TrackMeta } from "@/services/storage/types";
import { FakeGithub } from "@/testing/fakeGithub";
import { makeFile, randomBytes } from "@/testing/files";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteEverywhere } from "./deleteTrack";
import { syncNow, uploadTracks, type SyncContext } from "./engine";
import type { LibraryRepo } from "@/services/github/library";

const PRIVATE_LIB = "project-music-files";
const SHARED_LIB = "project-music-files-2";
const noSleep = async () => {};
// Small limits, so a big file needs overflow repos.
const config = { maxFileBytes: 100, maxRepoBytes: 250 };

const meta = (id: string): TrackMeta => ({
  id, kind: "audio", title: `Song ${id}`, artist: "", album: "", duration: 1,
  mime: "audio/mpeg", bytes: 0,
  addedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
});

let fake: FakeGithub;
let mine: LibraryRepo;
let shared: LibraryRepo;
let ctx: SyncContext;

const addLocal = (id: string, size: number, seed = 1) =>
  deviceProvider.writeTrack(meta(id), { media: makeFile(`${id}.mp3`, randomBytes(size, seed)) });
const wipeDevice = () =>
  Promise.all([db.songs.clear(), db.files.clear(), db.syncState.clear(), db.outbox.clear()]);
const titles = (repo: string) =>
  parseIndex(fake.fileText(repo, "index.json")!).tracks.filter((t) => !t.deleted).map((t) => t.id);

beforeEach(async () => {
  fake = new FakeGithub();
  const options = { api: new GithubApi(fake.token, fake.fetch), login: fake.login, config, sleep: noSleep };
  mine = await openLibrary(options, PRIVATE_LIB);
  shared = await openLibrary(options, SHARED_LIB);
  ctx = { libraries: [mine, shared], device: deviceProvider, upload: { sleep: noSleep } };
  await wipeDevice();
});

describe("several libraries", () => {
  it("uploads each song into the library chosen for it", async () => {
    await addLocal("private1", 40);
    await addLocal("shared1", 40, 2);

    await uploadTracks(ctx, ["private1"], PRIVATE_LIB);
    await uploadTracks(ctx, ["shared1"], SHARED_LIB);

    expect(titles(PRIVATE_LIB)).toEqual(["private1"]);
    expect(titles(SHARED_LIB)).toEqual(["shared1"]);
    expect((await db.syncState.get("shared1"))?.library).toBe(SHARED_LIB);
  });

  it("restores songs from every library on a new device", async () => {
    await addLocal("private1", 40);
    await addLocal("shared1", 40, 2);
    await uploadTracks(ctx, ["private1"], PRIVATE_LIB);
    await uploadTracks(ctx, ["shared1"], SHARED_LIB);

    await wipeDevice();
    expect(await syncNow(ctx)).toMatchObject({ queued: 2, done: 2 });

    expect((await deviceProvider.listTracks()).map((t) => t.id).sort()).toEqual(["private1", "shared1"]);
    expect((await db.syncState.get("shared1"))?.library).toBe(SHARED_LIB);
    expect(await syncNow(ctx)).toMatchObject({ queued: 0 });
  });

  it("deletes a song from the library that holds it", async () => {
    await addLocal("private1", 40);
    await addLocal("shared1", 40, 2);
    await uploadTracks(ctx, ["private1"], PRIVATE_LIB);
    await uploadTracks(ctx, ["shared1"], SHARED_LIB);

    expect(await deleteEverywhere("shared1", ctx.libraries)).toBe("deleted");

    expect(titles(SHARED_LIB)).toEqual([]);
    expect(titles(PRIVATE_LIB)).toEqual(["private1"]);
  });
});

describe("sharing a library", () => {
  it("makes the library and its overflow repos public, and private again", async () => {
    await addLocal("big", 300); // more than one repo holds
    await uploadTracks(ctx, ["big"], SHARED_LIB);
    const repos = parseIndex(fake.fileText(SHARED_LIB, "index.json")!).repos.map((r) => r.name);
    expect(repos).toEqual([SHARED_LIB, `${SHARED_LIB}-part-1`]);

    await setLibraryPrivate(shared, false);
    expect(repos.map((name) => fake.repos.get(name)?.private)).toEqual([false, false]);
    expect(fake.repos.get(PRIVATE_LIB)?.private).toBe(true); // other libraries stay private

    await setLibraryPrivate(shared, true);
    expect(repos.map((name) => fake.repos.get(name)?.private)).toEqual([true, true]);
  });

  it("starts new overflow repos of a public library as public", async () => {
    await setLibraryPrivate(shared, false);
    await addLocal("big", 300);

    await uploadTracks(ctx, ["big"], SHARED_LIB);

    expect(fake.repos.get(`${SHARED_LIB}-part-1`)?.private).toBe(false);
    // Anyone can now play it without signing in.
    const visitor = new PublicLibrary({ owner: fake.login, repo: SHARED_LIB }, fake.fetch);
    expect((await visitor.loadIndex()).tracks.map((t) => t.id)).toEqual(["big"]);
  });

  it("never opens the home repo as a public library", async () => {
    const options = { api: new GithubApi(fake.token, fake.fetch), login: fake.login, config, sleep: noSleep };
    await openHome(options, "project-music-home", PRIVATE_LIB);
    fake.repos.get("project-music-home")!.private = false; // even if made public on GitHub

    const visitor = new PublicLibrary({ owner: fake.login, repo: "project-music-home" }, fake.fetch);
    await expect(visitor.loadIndex()).rejects.toMatchObject({ reason: "not-library" });
  });
});
