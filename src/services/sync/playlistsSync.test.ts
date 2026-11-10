import { FAVOURITE_PLAYLIST_ID, RECENT_PLAYLIST_ID } from "@/constants";
import db from "@/services/db";
import { GithubApi } from "@/services/github/api";
import { findOrCreateLibrary } from "@/services/github/discovery";
import { parsePlaylists } from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";
import { deletePlaylist } from "@/services/playlistService";
import { FakeGithub } from "@/testing/fakeGithub";
import { beforeEach, describe, expect, it } from "vitest";
import { syncPlaylists } from "./playlistsSync";

const NAME = "project-music-files";
let fake: FakeGithub;
let library: LibraryRepo;

const playlist = (id: string, updatedAt: string, songIds: string[] = []) => ({
  id, name: id, songIds,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date(updatedAt),
});

const remote = () => parsePlaylists(fake.fileText(NAME, "playlists.json"));

beforeEach(async () => {
  await Promise.all([db.playlists.clear(), db.playlistTombstones.clear()]);
  fake = new FakeGithub();
  const api = new GithubApi(fake.token, fake.fetch);
  const found = await findOrCreateLibrary(
    api, fake.login, NAME, { maxFileBytes: 100, maxRepoBytes: 1000 }, async () => {},
  );
  if (found.status === "name-taken") throw new Error("unexpected");
  library = new LibraryRepo(api, fake.login, NAME, found.branch);
});

describe("syncPlaylists", () => {
  it("uploads local playlists, but not Recently Played", async () => {
    await db.playlists.bulkPut([
      playlist("mine", "2026-02-01T00:00:00.000Z", ["s1"]),
      playlist(RECENT_PLAYLIST_ID, "2026-02-01T00:00:00.000Z", ["s2"]),
    ]);

    const result = await syncPlaylists(library);

    expect(result.pushed).toBe(true);
    expect(remote().map((p) => p.id)).toEqual(["mine"]);
    expect(remote()[0].songIds).toEqual(["s1"]);
  });

  it("downloads playlists to a fresh device", async () => {
    await db.playlists.put(playlist("mine", "2026-02-01T00:00:00.000Z", ["s1"]));
    await syncPlaylists(library);

    await db.playlists.clear();
    const result = await syncPlaylists(library);

    expect(result).toMatchObject({ pushed: false, pulled: 1 });
    expect((await db.playlists.get("mine"))?.songIds).toEqual(["s1"]);
  });

  it("does not commit when nothing changed", async () => {
    await db.playlists.put(playlist("mine", "2026-02-01T00:00:00.000Z"));
    await syncPlaylists(library);
    const commits = fake.commitCount(NAME);

    const result = await syncPlaylists(library);

    expect(result).toMatchObject({ pushed: false, pulled: 0, removed: 0 });
    expect(fake.commitCount(NAME)).toBe(commits);
  });

  it("does not rewrite the track index when only playlists change", async () => {
    const before = fake.fileText(NAME, "index.json");
    await db.playlists.put(playlist("mine", "2026-02-01T00:00:00.000Z"));

    await syncPlaylists(library);

    expect(fake.fileText(NAME, "index.json")).toBe(before);
  });

  it("carries a deleted playlist to the library and clears the tombstone", async () => {
    await db.playlists.put(playlist("gone", "2026-02-01T00:00:00.000Z"));
    await syncPlaylists(library);

    await deletePlaylist("gone");
    expect(await db.playlistTombstones.count()).toBe(1);
    await syncPlaylists(library);

    expect(remote().find((p) => p.id === "gone")?.deleted).toBe(true);
    expect(await db.playlistTombstones.count()).toBe(0);
  });

  it("removes a playlist deleted on another device", async () => {
    await db.playlists.put(playlist("gone", "2026-02-01T00:00:00.000Z"));
    await syncPlaylists(library);
    const deviceA = await db.playlists.toArray();

    await deletePlaylist("gone"); // device B deletes and syncs
    await syncPlaylists(library);

    await db.playlists.bulkPut(deviceA); // back on device A
    const result = await syncPlaylists(library);

    expect(result.removed).toBe(1);
    expect(await db.playlists.get("gone")).toBeUndefined();
  });

  it("lets a fresh device's empty Favourites yield to the real one", async () => {
    await db.playlists.put(playlist(FAVOURITE_PLAYLIST_ID, "2026-02-01T00:00:00.000Z", ["liked"]));
    await syncPlaylists(library);

    await db.playlists.clear();
    await db.playlists.put(playlist(FAVOURITE_PLAYLIST_ID, new Date(0).toISOString())); // new device default
    await syncPlaylists(library);

    expect((await db.playlists.get(FAVOURITE_PLAYLIST_ID))?.songIds).toEqual(["liked"]);
    expect(remote().find((p) => p.id === FAVOURITE_PLAYLIST_ID)?.songIds).toEqual(["liked"]);
  });

  it("merges with a playlist change another device pushed meanwhile", async () => {
    await db.playlists.put(playlist("mine", "2026-02-01T00:00:00.000Z", ["a"]));
    fake.onNextRefUpdate(async () => {
      await fake.pushFiles(NAME, {
        "playlists.json": JSON.stringify({
          schemaVersion: 1,
          playlists: [{ id: "theirs", name: "theirs", songIds: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-02-02T00:00:00.000Z" }],
        }),
      });
    });

    await syncPlaylists(library);

    expect(remote().map((p) => p.id).sort()).toEqual(["mine", "theirs"]);
    expect(await db.playlists.get("theirs")).toBeDefined();
  });
});