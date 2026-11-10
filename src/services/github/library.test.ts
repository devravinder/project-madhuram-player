import { FakeGithub } from "@/testing/fakeGithub";
import { RateLimitError } from "@/services/httpError";
import { beforeEach, describe, expect, it } from "vitest";
import { GithubApi } from "./api";
import {
  createEmptyIndex,
  parseIndex,
  serializeIndex,
  type LibraryIndex,
  type TrackEntry,
} from "./indexTypes";
import { LibraryBusyError, LibraryRepo } from "./library";

const NAME = "project-music-files";
const config = { maxFileBytes: 50, maxRepoBytes: 800 };

const track = (id: string): TrackEntry => ({
  id,
  kind: "audio",
  title: id,
  artist: "",
  album: "",
  duration: 1,
  mime: "audio/mpeg",
  bytes: 1,
  addedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  manifest: `manifests/${id}.json`,
});

const withTrack = (index: LibraryIndex, id: string): LibraryIndex => ({
  ...index,
  tracks: [...index.tracks, track(id)],
});

let fake: FakeGithub;
let library: LibraryRepo;

beforeEach(async () => {
  fake = new FakeGithub();
  await fake.seedRepo(NAME, {
    "index.json": serializeIndex(createEmptyIndex(NAME, config)),
    "playlists.json": "[]",
  });
  library = new LibraryRepo(new GithubApi(fake.token, fake.fetch), fake.login, NAME);
});

const savedIndex = () => parseIndex(fake.fileText(NAME, "index.json")!);

describe("LibraryRepo", () => {
  it("reads the index and the head it came from", async () => {
    const { index, head } = await library.read();
    expect(index.currentRepo).toBe(NAME);
    expect(head.branch).toBe("main");
  });

  it("commits the index and extra files in one commit", async () => {
    const before = fake.commitCount(NAME);

    await library.update((index) => ({
      message: "Add a",
      index: withTrack(index, "a"),
      text: [{ path: "manifests/a.json", content: "{}" }],
    }));

    expect(fake.commitCount(NAME)).toBe(before + 1);
    expect(savedIndex().tracks.map((t) => t.id)).toEqual(["a"]);
    expect(fake.fileText(NAME, "manifests/a.json")).toBe("{}");
  });

  it("stamps a new update time", async () => {
    const saved = await library.update((index) => ({
      message: "touch",
      index: { ...index, updatedAt: "2000-01-01T00:00:00.000Z" },
    }));
    expect(saved.updatedAt).not.toBe("2000-01-01T00:00:00.000Z");
  });

  it("rebuilds on the new state when another device pushed first", async () => {
    // Another device adds track "theirs" right before our update lands.
    fake.onNextRefUpdate(async () => {
      const current = savedIndex();
      await fake.pushFiles(NAME, {
        "index.json": serializeIndex(withTrack(current, "theirs")),
      });
    });

    let builds = 0;
    await library.update((index) => {
      builds++;
      return { message: "Add mine", index: withTrack(index, "mine") };
    });

    expect(builds).toBe(2);
    expect(savedIndex().tracks.map((t) => t.id).sort()).toEqual(["mine", "theirs"]);
  });

  it("keeps files it did not touch from a concurrent push", async () => {
    fake.onNextRefUpdate(() => fake.pushFiles(NAME, { "playlists.json": '["theirs"]' }));

    await library.update((index) => ({ message: "x", index: withTrack(index, "a") }));

    expect(fake.fileText(NAME, "playlists.json")).toBe('["theirs"]');
  });

  it("gives up when the library never stops changing", async () => {
    let n = 0;
    const interfere = () => {
      fake.onNextRefUpdate(async () => {
        await fake.pushFiles(NAME, { [`noise-${n++}.txt`]: "x" });
        interfere();
      });
    };
    interfere();

    await expect(
      library.update((index) => ({ message: "x", index })),
    ).rejects.toBeInstanceOf(LibraryBusyError);
    expect(n).toBe(5);
  });

  it("does not retry a rate limit", async () => {
    fake.limitNext(1);
    await expect(
      library.update((index) => ({ message: "x", index })),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(fake.requests.filter((r) => r.startsWith("POST"))).toEqual([]);
  });

  it("removes files listed in the change set", async () => {
    await fake.pushFiles(NAME, { "manifests/old.json": "{}" });
    await library.update((index) => ({
      message: "drop",
      index,
      remove: ["manifests/old.json"],
    }));
    expect(fake.paths(NAME)).not.toContain("manifests/old.json");
  });
});
