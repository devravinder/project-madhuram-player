import db from "@/services/db";
import { GithubApi } from "@/services/github/api";
import { parseIndex, libraryLabel } from "@/services/github/indexTypes";
import {
  InvalidDisplayNameError,
  setDisplayName,
} from "@/services/github/displayName";
import { loadRemoteLibrary } from "@/services/public/remote";
import type { LibraryRepo } from "@/services/github/library";
import {
  homeInfo,
  openHome,
  openLibrary,
  saveLibrary,
} from "@/services/github/session";
import { renameSong } from "@/services/songsService";
import { deviceProvider } from "@/services/storage/deviceProvider";
import type { TrackMeta } from "@/services/storage/types";
import { FakeGithub } from "@/testing/fakeGithub";
import { makeFile, randomBytes } from "@/testing/files";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteLibrary,
  forgetLibrariesExcept,
  LastLibraryError,
} from "./deleteLibrary";
import { syncNow, uploadTracks, type SyncContext } from "./engine";
import { outbox } from "./outbox";

const FIRST = "music-library";
const SECOND = "music-library-2";
const HOME = "music-library-home";
const noSleep = async () => {};
// Small limits, so a big file needs an overflow repo.
const config = { maxFileBytes: 100, maxRepoBytes: 250 };

const meta = (id: string): TrackMeta => ({
  id,
  kind: "audio",
  title: `Song ${id}`,
  artist: "Ann",
  album: "Al",
  duration: 1,
  mime: "audio/mpeg",
  bytes: 0,
  addedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

let fake: FakeGithub;
let home: LibraryRepo;
let first: LibraryRepo;
let second: LibraryRepo;
let ctx: SyncContext;

const addLocal = (id: string, size: number, seed = 1) =>
  deviceProvider.writeTrack(meta(id), {
    media: makeFile(`${id}.mp3`, randomBytes(size, seed)),
  });
const entryIn = (repo: string, id: string) =>
  parseIndex(fake.fileText(repo, "index.json")!).tracks.find(
    (t) => t.id === id,
  );

beforeEach(async () => {
  await Promise.all([
    db.songs.clear(),
    db.files.clear(),
    db.syncState.clear(),
    db.outbox.clear(),
  ]);
  fake = new FakeGithub();
  const options = {
    api: new GithubApi(fake.token, fake.fetch),
    login: fake.login,
    config,
    sleep: noSleep,
  };
  home = await openHome(options, HOME, FIRST);
  first = await openLibrary(options, FIRST);
  second = await openLibrary(options, SECOND);
  await saveLibrary(home, SECOND);
  ctx = {
    libraries: [first, second],
    device: deviceProvider,
    upload: { sleep: noSleep },
  };
});

describe("rename a song", () => {
  it("sends only the new name to GitHub", async () => {
    await addLocal("a", 40);
    await uploadTracks(ctx, ["a"], FIRST);
    const partsBefore = fake.paths(FIRST).filter((p) => p.startsWith("data/"));

    await renameSong("a", {
      title: "New Title",
      artist: "New Artist",
      album: "Al",
    });
    await outbox.enqueue([{ op: "push-meta", trackId: "a", library: FIRST }]);
    await syncNow(ctx);

    expect(entryIn(FIRST, "a")).toMatchObject({
      title: "New Title",
      artist: "New Artist",
    });
    expect(fake.paths(FIRST).filter((p) => p.startsWith("data/"))).toEqual(
      partsBefore,
    );
  });

  it("is found by a plain sync, even with nothing queued", async () => {
    await addLocal("a", 40);
    await uploadTracks(ctx, ["a"], FIRST);
    await renameSong("a", { title: "Later", artist: "Ann", album: "Al" });

    await syncNow(ctx);

    expect(entryIn(FIRST, "a")?.title).toBe("Later");
  });

  it("takes a newer name from another device without downloading the file", async () => {
    await addLocal("a", 40);
    await uploadTracks(ctx, ["a"], FIRST);
    const mediaId = (await db.songs.get("a"))!.mediaId;
    await first.update((index) => ({
      message: "rename elsewhere",
      index: {
        ...index,
        tracks: index.tracks.map((t) =>
          t.id === "a"
            ? {
                ...t,
                title: "From Phone",
                updatedAt: "2030-01-01T00:00:00.000Z",
              }
            : t,
        ),
      },
    }));

    await syncNow(ctx, {}, "download");

    const song = await db.songs.get("a");
    expect(song).toMatchObject({ title: "From Phone", mediaId });
  });
});

describe("library display name", () => {
  it("is saved in the library's index, and the repo keeps its name", async () => {
    expect(await setDisplayName(second, "  Kids   songs ")).toBe("Kids songs");
    expect(parseIndex(fake.fileText(SECOND, "index.json")!).displayName).toBe(
      "Kids songs",
    );
    expect(fake.repos.has(SECOND)).toBe(true);
    expect(libraryLabel(SECOND, "Kids songs")).toBe("Kids songs");
  });

  it("is cleared by an empty name or the repo's own name", async () => {
    await setDisplayName(second, "Kids");
    expect(await setDisplayName(second, "")).toBeUndefined();
    expect(
      parseIndex(fake.fileText(SECOND, "index.json")!).displayName,
    ).toBeUndefined();
    await setDisplayName(second, SECOND);
    expect(libraryLabel(SECOND, undefined)).toBe(SECOND);
  });

  it("refuses a name that is too long", async () => {
    await expect(setDisplayName(second, "x".repeat(61))).rejects.toBeInstanceOf(
      InvalidDisplayNameError,
    );
  });

  it("is shown to listeners of a public library", async () => {
    await setDisplayName(second, "Bhajans");
    fake.repos.get(SECOND)!.private = false;
    vi.stubGlobal("fetch", fake.fetch);
    try {
      expect((await loadRemoteLibrary(fake.login, SECOND)).displayName).toBe(
        "Bhajans",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("delete a library", () => {
  it("deletes its repos and overflow repos, and keeps the songs here as not backed up", async () => {
    await addLocal("keep", 40);
    await addLocal("big", 300, 2); // needs an overflow repo
    await uploadTracks(ctx, ["keep"], FIRST);
    await uploadTracks(ctx, ["big"], SECOND);
    const overflow = parseIndex(fake.fileText(SECOND, "index.json")!).repos.map(
      (r) => r.name,
    );
    expect(overflow.length).toBeGreaterThan(1);

    const { info, notDeleted } = await deleteLibrary(home, second, [
      FIRST,
      SECOND,
    ]);

    expect(notDeleted).toEqual([]);
    for (const repo of overflow) expect(fake.repos.has(repo)).toBe(false);
    expect(fake.repos.has(FIRST)).toBe(true);
    expect(info).toEqual({ libraries: [FIRST], defaultLibrary: FIRST });
    expect(homeInfo((await home.read()).index).libraries).toEqual([FIRST]);
    expect(await db.songs.get("big")).toBeDefined();
    expect(await db.syncState.get("big")).toBeUndefined();
    expect(await db.syncState.get("keep")).toMatchObject({ library: FIRST });
  });

  it("moves the default to a library that is left", async () => {
    const { info } = await deleteLibrary(home, first, [FIRST, SECOND]);
    expect(info.defaultLibrary).toBe(SECOND);
  });

  it("keeps the last library", async () => {
    await expect(deleteLibrary(home, first, [FIRST])).rejects.toBeInstanceOf(
      LastLibraryError,
    );
    expect(fake.repos.has(FIRST)).toBe(true);
  });

  it("lets another device forget a library deleted elsewhere", async () => {
    await db.syncState.bulkPut([
      { trackId: "x", sha256: "h", library: FIRST },
      { trackId: "y", sha256: "h", library: "gone" },
    ]);
    await outbox.enqueue([{ op: "push", trackId: "y", library: "gone" }]);

    await forgetLibrariesExcept([FIRST]);

    expect((await db.syncState.toArray()).map((r) => r.trackId)).toEqual(["x"]);
    expect(await db.outbox.count()).toBe(0);

    await forgetLibrariesExcept([]); // a bad read never wipes everything
    expect(await db.syncState.count()).toBe(1);
  });
});
