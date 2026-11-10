import db from "@/services/db";
import { GithubApi } from "@/services/github/api";
import { findOrCreateLibrary } from "@/services/github/discovery";
import { LibraryRepo } from "@/services/github/library";
import { deviceProvider } from "@/services/storage/deviceProvider";
import type { TrackMeta } from "@/services/storage/types";
import { uploadTrack } from "@/services/sync/upload";
import { FakeGithub } from "@/testing/fakeGithub";
import { makeFile, randomBytes } from "@/testing/files";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackFileMissingError } from "./publicLibrary";
import { downloadCopy, findLocalCopy, remoteSongs, resolveRemote, toRemoteSong } from "./remote";

const NAME = "project-music-files";
const noSleep = async () => {};

const meta = (id: string): TrackMeta => ({
  id, kind: "audio", title: `Song ${id}`, artist: "Ann", album: "Al", duration: 7,
  mime: "audio/mpeg", bytes: 0,
  addedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
});

let fake: FakeGithub;
let library: LibraryRepo;

beforeEach(async () => {
  await Promise.all([db.songs.clear(), db.files.clear()]);
  fake = new FakeGithub();
  vi.stubGlobal("fetch", fake.fetch); // the app's own fetch reaches the fake
  const api = new GithubApi(fake.token, fake.fetch);
  const found = await findOrCreateLibrary(api, fake.login, NAME, { maxFileBytes: 100, maxRepoBytes: 10_000 }, noSleep);
  if (found.status === "name-taken") throw new Error("unexpected");
  library = new LibraryRepo(api, fake.login, NAME, found.branch);
  await uploadTrack(library, meta("small"), { media: makeFile("s.mp3", randomBytes(60)), cover: makeFile("c.jpg", randomBytes(20, 4), "image/jpeg") }, { sleep: noSleep });
  await uploadTrack(library, meta("large"), { media: makeFile("l.mp3", randomBytes(250, 3)) }, { sleep: noSleep });
  fake.repos.get(NAME)!.private = false;
});

afterEach(() => vi.unstubAllGlobals());

const remoteOf = async (id: string) => {
  const { index } = await library.read();
  return toRemoteSong(fake.login, NAME, index.tracks.find((t) => t.id === id)!);
};

describe("remote tracks", () => {
  it("lists live tracks and hides deleted ones", async () => {
    await library.update((index) => ({
      message: "remove",
      index: { ...index, tracks: index.tracks.map((t) => (t.id === "small" ? { ...t, deleted: true } : t)) },
    }));
    const { index } = await library.read();

    expect(remoteSongs(fake.login, NAME, index).map((s) => s.title)).toEqual(["Song large"]);
  });

  it("streams a one-part file and exposes its cover URL", async () => {
    const playable = await resolveRemote(await remoteOf("small"));

    expect(playable.mode).toBe("stream");
    expect(playable.mode === "stream" && playable.url).toContain("raw.githubusercontent.com");
    expect(playable.coverUrl).toContain("raw.githubusercontent.com");
  });

  it("downloads a split file before playing it", async () => {
    const started = vi.fn();

    const playable = await resolveRemote(await remoteOf("large"), started);

    expect(started).toHaveBeenCalledOnce();
    expect(playable.mode).toBe("download");
    if (playable.mode === "download") {
      expect(new Uint8Array(await playable.file.arrayBuffer())).toEqual(randomBytes(250, 3));
    }
  });

  it("reports a removed file as missing", async () => {
    const song = await remoteOf("small");
    song.remote!.manifest = "manifests/gone.json";

    await expect(resolveRemote(song)).rejects.toBeInstanceOf(TrackFileMissingError);
  });

  it("saves an independent copy that matches the original", async () => {
    const song = await remoteOf("large");

    const id = await downloadCopy(song);

    expect(id).not.toBe("large");
    const saved = await deviceProvider.getTrack(id);
    expect(saved).toMatchObject({ title: "Song large", artist: "Ann", sha256: song.sha256, bytes: 250 });
    const { media } = await deviceProvider.readTrackFiles(id);
    expect(new Uint8Array(await media.arrayBuffer())).toEqual(randomBytes(250, 3));
  });

  it("finds a saved copy by its content hash", async () => {
    const song = await remoteOf("small");
    expect(await findLocalCopy(song.sha256)).toBeUndefined();

    const id = await downloadCopy(song);

    expect((await findLocalCopy(song.sha256))?.id).toBe(id);
    expect(await findLocalCopy(undefined)).toBeUndefined();
  });

  it("gives each remote track an id that cannot clash with a local one", async () => {
    expect((await remoteOf("small")).id).toBe(`${fake.login}/${NAME}:small`);
  });
});