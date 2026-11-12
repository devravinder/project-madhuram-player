import type { TrackEntry } from "@/services/github/indexTypes";
import type { TrackMeta } from "@/services/storage/types";
import { describe, expect, it } from "vitest";
import { planSync } from "./planner";

const base = {
  kind: "audio" as const,
  artist: "",
  album: "",
  duration: 1,
  mime: "audio/mpeg",
  bytes: 1,
  addedAt: "2026-01-01T00:00:00.000Z",
};

const local = (id: string, sha?: string, updatedAt = "2026-01-01T00:00:00.000Z"): TrackMeta => ({
  ...base, id, title: id, sha256: sha, updatedAt,
});

const remote = (id: string, sha: string, extra: Partial<TrackEntry> = {}): TrackEntry => ({
  ...base, id, title: id, sha256: sha, updatedAt: "2026-01-01T00:00:00.000Z",
  manifest: `manifests/${id}.json`, ...extra,
});

const record = (trackId: string, sha256: string) => ({ trackId, sha256, library: "lib" });

describe("planSync", () => {
  it("pushes a new local track", () => {
    expect(planSync([local("a", "h")], [], [])).toEqual([{ op: "push", trackId: "a" }]);
  });

  it("leaves a new local track alone when new uploads are off", () => {
    expect(planSync([local("a", "h")], [], [], { pushNew: false })).toEqual([]);
  });

  it("still sends an edit of a backed-up track when new uploads are off", () => {
    expect(
      planSync([local("a", "new")], [remote("a", "old")], [record("a", "old")], { pushNew: false }),
    ).toEqual([{ op: "push", trackId: "a" }]);
  });

  it("pulls a new remote track", () => {
    expect(planSync([], [remote("a", "h")], [])).toEqual([{ op: "pull", trackId: "a" }]);
  });

  it("does nothing when both sides match", () => {
    expect(planSync([local("a", "h")], [remote("a", "h")], [record("a", "h")])).toEqual([]);
  });

  it("deletes remotely what was deleted here after a sync", () => {
    expect(planSync([], [remote("a", "h")], [record("a", "h")])).toEqual([
      { op: "delete-remote", trackId: "a" },
    ]);
  });

  it("leaves a track removed from this device only alone", () => {
    const kept = { ...record("a", "h"), deviceRemoved: true };
    expect(planSync([], [remote("a", "h")], [kept])).toEqual([]);
  });

  it("brings back a track removed from this device only when asked", () => {
    const kept = { ...record("a", "h"), deviceRemoved: true };
    expect(planSync([], [remote("a", "h")], [kept], { restoreDeviceRemoved: true })).toEqual([
      { op: "pull", trackId: "a" },
    ]);
  });

  it("deletes locally what was deleted elsewhere after a sync", () => {
    expect(planSync([local("a", "h")], [remote("a", "h", { deleted: true })], [record("a", "h")])).toEqual([
      { op: "delete-local", trackId: "a" },
    ]);
  });

  it("deletes locally when the remote entry vanished after a sync", () => {
    expect(planSync([local("a", "h")], [], [record("a", "h")])).toEqual([
      { op: "delete-local", trackId: "a" },
    ]);
  });

  it("does not resurrect a remote tombstone for an unsynced local track", () => {
    expect(planSync([local("a", "h")], [remote("a", "h", { deleted: true })], [])).toEqual([
      { op: "delete-local", trackId: "a" },
    ]);
  });

  it("ignores tombstones for tracks that are not here", () => {
    expect(planSync([], [remote("a", "h", { deleted: true })], [])).toEqual([]);
  });

  it("pushes a local edit when only this side changed", () => {
    expect(planSync([local("a", "new")], [remote("a", "old")], [record("a", "old")])).toEqual([
      { op: "push", trackId: "a" },
    ]);
  });

  it("pulls a remote edit when only the other side changed", () => {
    expect(planSync([local("a", "old")], [remote("a", "new")], [record("a", "old")])).toEqual([
      { op: "pull", trackId: "a" },
    ]);
  });

  it("lets the newer edit win when both sides changed", () => {
    const older = "2026-01-01T00:00:00.000Z";
    const newer = "2026-02-01T00:00:00.000Z";

    expect(
      planSync([local("a", "mine", newer)], [remote("a", "theirs", { updatedAt: older })], [record("a", "base")]),
    ).toEqual([{ op: "push", trackId: "a" }]);
    expect(
      planSync([local("a", "mine", older)], [remote("a", "theirs", { updatedAt: newer })], [record("a", "base")]),
    ).toEqual([{ op: "pull", trackId: "a" }]);
  });

  it("uses the last synced hash when a local track was never hashed", () => {
    expect(planSync([local("a")], [remote("a", "h")], [record("a", "h")])).toEqual([]);
  });

  it("leaves an unhashed, unsynced track alone", () => {
    expect(planSync([local("a")], [remote("a", "h")], [])).toEqual([]);
  });
});
