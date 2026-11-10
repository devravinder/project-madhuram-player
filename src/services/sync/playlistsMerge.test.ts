import type { PlaylistEntry } from "@/services/github/indexTypes";
import { describe, expect, it } from "vitest";
import { mergePlaylists } from "./playlistsMerge";

const OLD = "2026-01-01T00:00:00.000Z";
const NEW = "2026-02-01T00:00:00.000Z";
const NEWEST = "2026-03-01T00:00:00.000Z";

const list = (id: string, updatedAt = OLD, songIds: string[] = [], extra: Partial<PlaylistEntry> = {}): PlaylistEntry => ({
  id, name: id, songIds, createdAt: OLD, updatedAt, ...extra,
});

describe("mergePlaylists", () => {
  it("sends a new local playlist to the library", () => {
    const r = mergePlaylists([list("a")], [], []);
    expect(r.remoteChanged).toBe(true);
    expect(r.remote.map((p) => p.id)).toEqual(["a"]);
    expect(r.upsert).toEqual([]);
  });

  it("brings a new remote playlist here", () => {
    const r = mergePlaylists([], [list("a")], []);
    expect(r.upsert.map((p) => p.id)).toEqual(["a"]);
    expect(r.remoteChanged).toBe(false);
  });

  it("does nothing when both copies are equal", () => {
    const r = mergePlaylists([list("a", OLD, ["s"])], [list("a", OLD, ["s"])], []);
    expect(r).toMatchObject({ upsert: [], remove: [], remoteChanged: false });
  });

  it("takes the newer copy in either direction", () => {
    const mineNewer = mergePlaylists([list("a", NEW, ["mine"])], [list("a", OLD, ["theirs"])], []);
    expect(mineNewer.remoteChanged).toBe(true);
    expect(mineNewer.remote[0].songIds).toEqual(["mine"]);

    const theirsNewer = mergePlaylists([list("a", OLD, ["mine"])], [list("a", NEW, ["theirs"])], []);
    expect(theirsNewer.upsert[0].songIds).toEqual(["theirs"]);
    expect(theirsNewer.remoteChanged).toBe(false);
  });

  it("records a local delete in the library", () => {
    const r = mergePlaylists([], [list("a", OLD)], [{ id: "a", deletedAt: NEW }]);
    expect(r.remoteChanged).toBe(true);
    expect(r.remote[0]).toMatchObject({ id: "a", deleted: true, updatedAt: NEW, songIds: [] });
    expect(r.upsert).toEqual([]);
  });

  it("restores a playlist that was edited elsewhere after the local delete", () => {
    const r = mergePlaylists([], [list("a", NEWEST, ["s"])], [{ id: "a", deletedAt: NEW }]);
    expect(r.upsert.map((p) => p.id)).toEqual(["a"]);
    expect(r.remoteChanged).toBe(false);
  });

  it("removes a playlist deleted elsewhere", () => {
    const r = mergePlaylists([list("a", OLD)], [list("a", NEW, [], { deleted: true })], []);
    expect(r.remove).toEqual(["a"]);
    expect(r.remoteChanged).toBe(false);
  });

  it("keeps a playlist edited here after it was deleted elsewhere", () => {
    const r = mergePlaylists([list("a", NEWEST, ["s"])], [list("a", NEW, [], { deleted: true })], []);
    expect(r.remove).toEqual([]);
    expect(r.remote[0].deleted).toBeUndefined();
    expect(r.remoteChanged).toBe(true);
  });

  it("ignores a remote tombstone for a playlist this device never had", () => {
    const r = mergePlaylists([], [list("a", NEW, [], { deleted: true })], []);
    expect(r).toMatchObject({ upsert: [], remove: [], remoteChanged: false });
  });

  it("leaves ignored playlists alone", () => {
    const r = mergePlaylists([list("recent", NEW, ["x"])], [], [], ["recent"]);
    expect(r.remote).toEqual([]);
    expect(r.remoteChanged).toBe(false);
  });

  it("keeps remote playlists it did not touch", () => {
    const r = mergePlaylists([list("a", NEW)], [list("a", OLD), list("b", OLD)], []);
    expect(r.remote.map((p) => p.id)).toEqual(["a", "b"]);
  });
});