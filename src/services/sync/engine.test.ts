import db from "@/services/db";
import { GithubApi } from "@/services/github/api";
import { findOrCreateLibrary } from "@/services/github/discovery";
import { LibraryRepo } from "@/services/github/library";
import { parseIndex, type Manifest } from "@/services/github/indexTypes";
import { deviceProvider } from "@/services/storage/deviceProvider";
import type { TrackMeta } from "@/services/storage/types";
import { FakeGithub } from "@/testing/fakeGithub";
import { makeFile, randomBytes } from "@/testing/files";
import { beforeEach, describe, expect, it } from "vitest";
import { outbox } from "./outbox";
import { resumeQueued, syncNow, uploadTracks, type SyncContext, type SyncMode } from "./engine";

const NAME = "project-music-files";
const PART = 100;
const config = { maxFileBytes: PART, maxRepoBytes: 10_000 };
const noSleep = async () => {};

let fake: FakeGithub;
let offline = false;
let dropAfterPosts: number | null = null;
let posts = 0;
let ctx: SyncContext;

const meta = (id: string): TrackMeta => ({
  id, kind: "audio", title: `Song ${id}`, artist: "A", album: "B", duration: 3,
  mime: "audio/mpeg", bytes: 0,
  addedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
});

const addLocal = (id: string, size: number, seed = 1, cover = false) =>
  deviceProvider.writeTrack(meta(id), {
    media: makeFile(`${id}.mp3`, randomBytes(size, seed)),
    cover: cover ? makeFile("c.jpg", randomBytes(30, seed + 50), "image/jpeg") : undefined,
  });

const wipeDevice = () =>
  Promise.all([db.songs.clear(), db.files.clear(), db.syncState.clear(), db.outbox.clear(), db.playlists.clear()]);

const snapshot = async () => ({
  songs: await db.songs.toArray(),
  files: await db.files.toArray(),
  syncState: await db.syncState.toArray(),
});
const restore = async (s: Awaited<ReturnType<typeof snapshot>>) => {
  await wipeDevice();
  await db.songs.bulkPut(s.songs);
  await db.files.bulkPut(s.files);
  await db.syncState.bulkPut(s.syncState);
};

const remoteIndex = () => parseIndex(fake.fileText(NAME, "index.json")!);
const sync = (options = {}, mode: SyncMode = "both") => syncNow(ctx, options, mode);
// New tracks go to GitHub only when the user uploads them.
const upload = (options = {}) => sync(options, "upload");

beforeEach(async () => {
  offline = false;
  dropAfterPosts = null;
  posts = 0;
  fake = new FakeGithub();
  const api = new GithubApi(fake.token, (input, init) => {
    if (init?.method === "POST") posts++;
    const cut = dropAfterPosts !== null && posts > dropAfterPosts;
    return offline || cut
      ? Promise.reject(new TypeError("offline"))
      : fake.fetch(input, init);
  });
  const found = await findOrCreateLibrary(api, fake.login, NAME, config, noSleep);
  if (found.status === "name-taken") throw new Error("unexpected");
  ctx = {
    library: new LibraryRepo(api, fake.login, NAME, found.branch),
    device: deviceProvider,
    upload: { sleep: noSleep },
  };
  await wipeDevice();
  posts = 0; // count only writes made by the test itself
});

describe("syncNow", () => {
  it("uploads new local tracks, including a large one with a cover", async () => {
    await addLocal("aa1", 60);
    await addLocal("bb2", 250, 2, true);

    const result = await upload();

    expect(result).toMatchObject({ queued: 2, done: 2, failed: 0 });
    expect(remoteIndex().tracks.map((t) => t.id).sort()).toEqual(["aa1", "bb2"]);
    expect((await db.syncState.toArray()).map((r) => r.trackId).sort()).toEqual(["aa1", "bb2"]);
    expect((await db.songs.get("bb2"))?.sha256).toHaveLength(64);
    expect(await db.outbox.count()).toBe(0);
  });

  it("restores a library on a fresh device with identical files", async () => {
    await addLocal("aa1", 60);
    await addLocal("bb2", 250, 2, true);
    const original = await deviceProvider.readTrackFiles("bb2");
    await upload();

    await wipeDevice();
    const result = await sync();

    expect(result).toMatchObject({ queued: 2, done: 2 });
    const restored = await deviceProvider.readTrackFiles("bb2");
    expect(new Uint8Array(await restored.media.arrayBuffer())).toEqual(
      new Uint8Array(await original.media.arrayBuffer()),
    );
    expect(restored.cover?.size).toBe(30);
    expect((await deviceProvider.getTrack("bb2"))?.title).toBe("Song bb2");
  });

  it("has nothing to do on a second run", async () => {
    await addLocal("aa1", 60);
    await upload();

    expect(await sync()).toMatchObject({ queued: 0, done: 0 });
    expect(await upload()).toMatchObject({ queued: 0, done: 0 });
  });

  it("does not upload new tracks on a plain sync", async () => {
    await addLocal("aa1", 60);

    expect(await sync()).toMatchObject({ queued: 0, done: 0 });
    expect(remoteIndex().tracks).toEqual([]);
  });

  it("uploads only the chosen tracks", async () => {
    await addLocal("small", 40);
    await addLocal("large", 250, 2);

    const result = await uploadTracks(ctx, ["small"]);

    expect(result).toMatchObject({ queued: 1, done: 1 });
    expect(remoteIndex().tracks.map((t) => t.id)).toEqual(["small"]);
    expect(await db.syncState.get("large")).toBeUndefined();
  });

  it("finishes queued steps without planning new uploads", async () => {
    await addLocal("queued", 40);
    await addLocal("not-chosen", 40, 2);
    await outbox.enqueue([{ op: "push", trackId: "queued" }]);

    const result = await resumeQueued(ctx);

    expect(result.done).toBe(1);
    expect(remoteIndex().tracks.map((t) => t.id)).toEqual(["queued"]);
  });

  it("carries a delete from one device to another", async () => {
    await addLocal("keep", 40, 1);
    await addLocal("drop", 40, 2);
    await upload();
    const deviceA = await snapshot();

    await wipeDevice(); // device B pulls everything, then deletes one
    await sync();
    await deviceProvider.removeTrack("drop");
    await sync();

    const tomb = remoteIndex().tracks.find((t) => t.id === "drop");
    expect(tomb?.deleted).toBe(true);

    await restore(deviceA); // back on device A
    const result = await sync();

    expect(result).toMatchObject({ queued: 1, done: 1 });
    expect((await deviceProvider.listTracks()).map((t) => t.id)).toEqual(["keep"]);
  });

  it("keeps a track that was added elsewhere instead of deleting it", async () => {
    await addLocal("aa1", 40);
    await upload();
    const deviceA = await snapshot();

    await wipeDevice();
    await sync();
    await addLocal("new-on-b", 40, 3);
    await upload();

    await restore(deviceA);
    await sync();

    expect((await deviceProvider.listTracks()).map((t) => t.id).sort()).toEqual(["aa1", "new-on-b"]);
  });

  it("resumes after the connection drops partway", async () => {
    await addLocal("aa1", 40);
    await addLocal("bb2", 40, 2);
    dropAfterPosts = 6; // the first track needs 5 writes; the second one is cut off

    const first = await upload();
    expect(first.stoppedBy).toBe("offline");
    expect(first.done).toBe(1);
    expect(await db.outbox.count()).toBe(1);

    dropAfterPosts = null;
    const second = await upload();
    expect(second).toMatchObject({ queued: 0, done: 1 });
    expect(remoteIndex().tracks).toHaveLength(2);
  });

  it("reports offline instead of throwing when it cannot read the library", async () => {
    await addLocal("aa1", 40);
    offline = true;

    const result = await sync();

    expect(result).toMatchObject({ stoppedBy: "offline", queued: 0, done: 0 });
  });

  it("pauses on a rate limit and carries on later", async () => {
    await addLocal("aa1", 40);
    await addLocal("bb2", 40, 2);
    let clock = 5_000_000;
    fake.limitNextWrites(1);

    const first = await upload({ now: () => clock });
    expect(first.stoppedBy).toBe("rate-limit");
    expect(first.done).toBe(0);

    const tooSoon = await upload({ now: () => clock + 1_000 });
    expect(tooSoon.done).toBe(0);
    expect(tooSoon.waitMs).toBeGreaterThan(0);

    clock += 8_000; // the fake asks for 7 seconds
    const second = await upload({ now: () => clock });
    expect(second.done).toBe(2);
  });

  it("does not save a track whose download is corrupt", async () => {
    await addLocal("aa1", 80);
    await upload();
    const manifest = JSON.parse(fake.fileText(NAME, "manifests/aa1.json")!) as Manifest;
    manifest.media.sha256 = "0".repeat(64);
    await fake.pushFiles(NAME, { "manifests/aa1.json": JSON.stringify(manifest) });

    await wipeDevice();
    const now = Date.now();
    for (let i = 0; i < 5; i++) await sync({ now: () => now + i * 600_000 });

    expect(await db.songs.count()).toBe(0);
    expect((await outbox.list())[0]).toMatchObject({ status: "failed" });
  });

  it("upload only sends new tracks and leaves everything else queued for later", async () => {
    await addLocal("here", 40);
    await upload(); // here -> remote
    const deviceA = await snapshot();

    await wipeDevice();
    await sync(); // device B pulls "here"
    await addLocal("only-b", 40, 3);
    await upload(); // pushes "only-b"
    await restore(deviceA); // device A again: has "here", lacks "only-b"
    await addLocal("only-a", 40, 4);

    const result = await sync({}, "upload");

    expect(result.done).toBe(1); // only-a was pushed
    expect((await deviceProvider.listTracks()).map((t) => t.id).sort()).toEqual(["here", "only-a"]);
    expect(remoteIndex().tracks.map((t) => t.id).sort()).toEqual(["here", "only-a", "only-b"]);
  });

  it("download only brings tracks in and sends nothing", async () => {
    await addLocal("a", 40);
    await upload();
    const deviceA = await snapshot();

    await wipeDevice();
    await addLocal("local-only", 40, 9);
    await sync(); // pulls "a"
    await upload(); // pushes "local-only"
    await restore(deviceA);
    const writesBefore = fake.requests.filter((r) => r.startsWith("POST")).length;

    const result = await sync({}, "download");

    expect(result.done).toBe(1); // pulled "local-only"
    expect(fake.requests.filter((r) => r.startsWith("POST")).length).toBe(writesBefore);
    expect((await deviceProvider.listTracks()).map((t) => t.id).sort()).toEqual(["a", "local-only"]);
  });

  it("skips a push if the track was deleted while queued", async () => {
    await addLocal("aa1", 40);
    await outbox.enqueue([{ op: "push", trackId: "aa1" }]);
    await deviceProvider.removeTrack("aa1");

    const result = await sync();

    expect(result.done).toBe(1);
    expect(remoteIndex().tracks).toEqual([]);
  });
});
