import db from "@/services/db";
import { GithubApi } from "@/services/github/api";
import {
  createEmptyIndex,
  parseIndex,
  serializeIndex,
} from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";
import { deviceProvider } from "@/services/storage/deviceProvider";
import type { TrackMeta } from "@/services/storage/types";
import { FakeGithub } from "@/testing/fakeGithub";
import { makeFile, randomBytes } from "@/testing/files";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteEverywhere, isBackedUp, removeFromDeviceOnly } from "./deleteTrack";
import { syncNow, uploadTracks, type SyncContext, type SyncMode } from "./engine";
import { removeRemoteTrack } from "./remove";
import { uploadTrack } from "./upload";
import { createPlaylist, getPlaylists } from "@/services/playlistService";

const NAME = "project-music-files";
const PART = 100;
const REPO_LIMIT = 250;
const noSleep = async () => {};

const meta = (id: string): TrackMeta => ({
  id, kind: "audio", title: `Song ${id}`, artist: "", album: "", duration: 1,
  mime: "audio/mpeg", bytes: 0,
  addedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
});

let fake: FakeGithub;
let offline = false;
let library: LibraryRepo;
let ctx: SyncContext;

const index = () => parseIndex(fake.fileText(NAME, "index.json")!);
const sync = (mode: SyncMode = "both") => syncNow(ctx, {}, mode);
const uploadAll = async () =>
  uploadTracks(ctx, (await deviceProvider.listTracks()).map((t) => t.id), NAME);
const addLocal = (id: string, size: number, seed = 1) =>
  deviceProvider.writeTrack(meta(id), { media: makeFile(`${id}.mp3`, randomBytes(size, seed)) });
const wipeDevice = () =>
  Promise.all([db.songs.clear(), db.files.clear(), db.syncState.clear(), db.outbox.clear(), db.playlists.clear()]);
const trackPaths = (repo: string, id: string) =>
  fake.paths(repo).filter((p) => p.includes(id));

beforeEach(async () => {
  offline = false;
  fake = new FakeGithub();
  await fake.seedRepo(NAME, {
    "index.json": serializeIndex(
      createEmptyIndex(NAME, { maxFileBytes: PART, maxRepoBytes: REPO_LIMIT }),
    ),
  });
  const api = new GithubApi(fake.token, (input, init) =>
    offline ? Promise.reject(new TypeError("offline")) : fake.fetch(input, init),
  );
  library = new LibraryRepo(api, fake.login, NAME, "main", noSleep);
  ctx = { libraries: [library], device: deviceProvider, upload: { sleep: noSleep } };
  await wipeDevice();
});

describe("removeRemoteTrack", () => {
  it("removes the manifest and parts, frees the space and leaves a tombstone", async () => {
    await uploadTrack(library, meta("aa1"), { media: makeFile("a.bin", randomBytes(150, 1)) });
    await uploadTrack(library, meta("bb2"), { media: makeFile("b.bin", randomBytes(50, 2)) });
    expect(index().repos[0].usedBytes).toBe(200);

    await removeRemoteTrack(library, "aa1");

    expect(trackPaths(NAME, "aa1")).toEqual([]);
    expect(trackPaths(NAME, "bb2")).toHaveLength(2); // manifest + part
    expect(index().repos[0].usedBytes).toBe(50);
    expect(index().tracks.find((t) => t.id === "aa1")?.deleted).toBe(true);
  });

  it("removes parts from overflow repos too and reopens a full repo", async () => {
    await uploadTrack(library, meta("aa1"), { media: makeFile("a.bin", randomBytes(200, 1)) });
    await uploadTrack(library, meta("bb2"), { media: makeFile("b.bin", randomBytes(300, 2)) }, { sleep: noSleep });
    // 300 bytes is more than one repo holds: it spans two overflow repos.
    const shards = [`${NAME}-part-1`, `${NAME}-part-2`];
    for (const shard of shards) expect(trackPaths(shard, "bb2").length).toBeGreaterThan(0);

    await removeRemoteTrack(library, "bb2");

    expect(trackPaths(NAME, "bb2")).toEqual([]);
    for (const shard of shards) expect(trackPaths(shard, "bb2")).toEqual([]);
    expect(index().repos.map((r) => r.usedBytes)).toEqual([200, 0, 0]);
    expect(index().repos.every((r) => !r.full || r.name === NAME)).toBe(true);
  });

  it("is safe to run twice", async () => {
    await uploadTrack(library, meta("aa1"), { media: makeFile("a.bin", randomBytes(50, 1)) });
    await removeRemoteTrack(library, "aa1");
    const commits = fake.commitCount(NAME);

    await removeRemoteTrack(library, "aa1");

    expect(fake.commitCount(NAME)).toBe(commits);
  });
});

describe("deleting a backed-up song", () => {
  it("delete everywhere removes it from GitHub at once", async () => {
    await addLocal("aa1", 50);
    await uploadAll();

    expect(await deleteEverywhere("aa1", [library])).toBe("deleted");

    expect(await db.songs.count()).toBe(0);
    expect(trackPaths(NAME, "aa1")).toEqual([]);
    expect(await isBackedUp("aa1")).toBe(false);
    expect(await sync()).toMatchObject({ queued: 0 });
  });

  it("delete everywhere while offline finishes on the next sync", async () => {
    await addLocal("aa1", 50);
    await uploadAll();
    offline = true;

    expect(await deleteEverywhere("aa1", [library])).toBe("queued");
    expect(await db.songs.count()).toBe(0);

    offline = false;
    await sync();
    expect(trackPaths(NAME, "aa1")).toEqual([]);
    expect(index().tracks[0].deleted).toBe(true);
  });

  it("remove from this device keeps it on GitHub until a download sync", async () => {
    await addLocal("aa1", 50);
    await addLocal("bb2", 50, 2);
    await uploadAll();
    await createPlaylist({ name: "Mix", description: "", songIds: ["aa1", "bb2"] });

    await removeFromDeviceOnly("aa1");

    expect(await sync()).toMatchObject({ queued: 0 }); // no pull, no delete
    expect(await syncNow(ctx, {}, "both")).toMatchObject({ queued: 0 });
    expect(trackPaths(NAME, "aa1")).toHaveLength(2);
    expect((await getPlaylists()).find((p) => p.name === "Mix")?.songIds).toEqual(["aa1", "bb2"]);

    expect(await sync("download")).toMatchObject({ queued: 1, done: 1 });
    expect((await deviceProvider.listTracks()).map((t) => t.id).sort()).toEqual(["aa1", "bb2"]);
    expect((await db.syncState.get("aa1"))?.deviceRemoved).toBeFalsy();
  });
});
