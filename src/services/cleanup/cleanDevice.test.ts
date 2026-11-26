import db from "@/services/db";
import { deviceProvider } from "@/services/storage/deviceProvider";
import type { TrackMeta } from "@/services/storage/types";
import { makeFile, randomBytes } from "@/testing/files";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanDevice } from "./cleanDevice";

const HOUR = 60 * 60 * 1000;
const NOW = Date.now() + 2 * 24 * HOUR;

const meta = (id: string, sha256?: string): TrackMeta => ({
  id,
  kind: "audio",
  title: id,
  artist: "",
  album: "",
  duration: 1,
  mime: "audio/mpeg",
  bytes: 10,
  sha256,
  addedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const addFile = (id: string, size: number, createdAt: number) =>
  db.files.put({
    id,
    data: makeFile(id, randomBytes(size, 1)),
    createdAt: new Date(createdAt),
  });

const addPart = (fileSha256: string, savedAt: number) =>
  db.downloadedParts.put({
    id: `${fileSha256}:0`,
    fileSha256,
    n: 0,
    data: new Blob([randomBytes(5, 2) as BlobPart]),
    savedAt,
  });

const uploadRecord = (trackId: string) => ({
  id: `${trackId}:repo:path`,
  trackId,
  fileSha256: "f",
  repo: "repo",
  path: "path",
  bytes: 1,
  sha: "s",
});

beforeEach(async () => {
  await Promise.all([
    db.songs.clear(),
    db.files.clear(),
    db.downloadedParts.clear(),
    db.uploadedParts.clear(),
    db.outbox.clear(),
    db.followedSources.clear(),
  ]);
});

describe("cleanDevice", () => {
  it("removes old files no song uses and keeps the rest", async () => {
    await deviceProvider.writeTrack(meta("song"), {
      media: makeFile("song.mp3", randomBytes(10, 1)),
    });
    await addFile("old.mp3", 30, Date.now() - 2 * 24 * HOUR);
    await addFile("new.mp3", 20, NOW - 10 * 60 * 1000); // maybe being added

    const result = await cleanDevice({ now: NOW });

    expect(result).toEqual({ items: 1, bytes: 30 });
    expect((await db.files.toArray()).map((f) => f.id).sort()).toEqual(
      [(await db.songs.get("song"))!.mediaId, "new.mp3"].sort(),
    );
  });

  it("removes download parts of saved songs, and old ones unless downloading", async () => {
    await deviceProvider.writeTrack(meta("song", "saved"), {
      media: makeFile("song.mp3", randomBytes(10, 1)),
    });
    await addPart("saved", NOW);
    await addPart("old", NOW - 2 * 24 * HOUR);
    await addPart("recent", NOW - HOUR);

    await cleanDevice({ now: NOW, downloading: true });
    expect(
      (await db.downloadedParts.toArray()).map((p) => p.fileSha256).sort(),
    ).toEqual(["old", "recent"]);

    await cleanDevice({ now: NOW });
    expect(
      (await db.downloadedParts.toArray()).map((p) => p.fileSha256),
    ).toEqual(["recent"]);
  });

  it("removes upload records that will not carry on", async () => {
    await deviceProvider.writeTrack(meta("queued"), {
      media: makeFile("q.mp3", randomBytes(10, 1)),
    });
    await deviceProvider.writeTrack(meta("idle"), {
      media: makeFile("i.mp3", randomBytes(10, 2)),
    });
    await db.outbox.put({
      id: "push:queued",
      op: "push",
      trackId: "queued",
      library: "lib",
      status: "pending",
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: 0,
    });
    await db.uploadedParts.bulkPut([
      uploadRecord("queued"),
      uploadRecord("idle"),
      uploadRecord("gone"),
    ]);

    await cleanDevice({ now: NOW });

    expect((await db.uploadedParts.toArray()).map((p) => p.trackId)).toEqual([
      "queued",
    ]);
  });

  it("forgets unfollows when signed out; signed in, sync does it", async () => {
    await db.followedSources.bulkPut([
      { address: "a/x", updatedAt: new Date(), removed: true },
      { address: "b/y", updatedAt: new Date() },
    ]);

    await cleanDevice({ now: NOW, signedIn: true });
    expect(await db.followedSources.count()).toBe(2);

    await cleanDevice({ now: NOW });
    expect((await db.followedSources.toArray()).map((s) => s.address)).toEqual([
      "b/y",
    ]);
  });
});
