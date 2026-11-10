import db from "@/services/db";
import { makeFile, randomBytes, readText } from "@/testing/files";
import { beforeEach, describe, expect, it } from "vitest";
import { deviceProvider } from "./deviceProvider";
import { TrackNotFoundError, type TrackMeta } from "./types";

const meta = (overrides: Partial<TrackMeta> = {}): TrackMeta => ({
  id: "track-1",
  kind: "audio",
  title: "Song",
  artist: "Artist",
  album: "Album",
  duration: 61,
  mime: "audio/mpeg",
  bytes: 5,
  addedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  ...overrides,
});

beforeEach(async () => {
  await Promise.all([db.songs.clear(), db.files.clear(), db.playlists.clear()]);
});

describe("deviceProvider", () => {
  it("round-trips a track and its files", async () => {
    await deviceProvider.writeTrack(meta(), {
      media: makeFile("song.mp3", "audio-bytes"),
      cover: makeFile("cover.jpg", "cover-bytes", "image/jpeg"),
    });

    expect(await deviceProvider.listTracks()).toEqual([meta()]);

    const files = await deviceProvider.readTrackFiles("track-1");
    expect(await readText(files.media)).toBe("audio-bytes");
    expect(await readText(files.cover!)).toBe("cover-bytes");
  });

  it("keeps binary content intact", async () => {
    const bytes = randomBytes(5000);
    await deviceProvider.writeTrack(meta(), {
      media: makeFile("song.mp3", bytes),
    });

    const { media } = await deviceProvider.readTrackFiles("track-1");
    expect(new Uint8Array(await media.arrayBuffer())).toEqual(bytes);
  });

  it("replaces files when the same id is written again", async () => {
    await deviceProvider.writeTrack(meta(), {
      media: makeFile("a.mp3", "first"),
      cover: makeFile("c.jpg", "cover", "image/jpeg"),
    });
    await deviceProvider.writeTrack(meta({ title: "Renamed" }), {
      media: makeFile("b.mp3", "second"),
    });

    expect(await db.files.count()).toBe(1);
    expect((await deviceProvider.listTracks())[0].title).toBe("Renamed");
    const { media, cover } = await deviceProvider.readTrackFiles("track-1");
    expect(await readText(media)).toBe("second");
    expect(cover).toBeUndefined();
  });

  it("removes the track and its files", async () => {
    await deviceProvider.writeTrack(meta(), {
      media: makeFile("a.mp3", "x"),
      cover: makeFile("c.jpg", "y", "image/jpeg"),
    });

    await deviceProvider.removeTrack("track-1");

    expect(await deviceProvider.listTracks()).toEqual([]);
    expect(await db.files.count()).toBe(0);
  });

  it("throws for an unknown track", async () => {
    await expect(deviceProvider.readTrackFiles("nope")).rejects.toBeInstanceOf(
      TrackNotFoundError,
    );
  });

  it("reports songs imported before sync with an update time", async () => {
    await db.songs.put({
      id: "old",
      kind: "audio",
      title: "Old",
      artist: "A",
      album: "B",
      duration: 1,
      mime: "audio/mpeg",
      bytes: 1,
      addedAt: new Date("2025-05-05T00:00:00.000Z"),
      mediaId: "m",
    });

    const [track] = await deviceProvider.listTracks();
    expect(track.updatedAt).toBe("2025-05-05T00:00:00.000Z");
  });
});
