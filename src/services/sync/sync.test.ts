import { GithubApi } from "@/services/github/api";
import {
  createEmptyIndex,
  parseIndex,
  serializeIndex,
  type Manifest,
} from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";
import type { TrackMeta } from "@/services/storage/types";
import { FakeGithub } from "@/testing/fakeGithub";
import { makeFile, randomBytes } from "@/testing/files";
import { beforeEach, describe, expect, it } from "vitest";
import { fetchTrackFiles, IntegrityError } from "./download";
import { joinParts, splitBlob } from "./split";
import { RepoFullError, uploadTrack } from "./upload";

const NAME = "project-music-files";
const PART = 100;

const meta = (id: string, overrides: Partial<TrackMeta> = {}): TrackMeta => ({
  id,
  kind: "audio",
  title: `Song ${id}`,
  artist: "A",
  album: "B",
  duration: 5,
  mime: "audio/mpeg",
  bytes: 0,
  addedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

let fake: FakeGithub;
let library: LibraryRepo;

const start = async (maxRepoBytes = 10_000) => {
  fake = new FakeGithub();
  await fake.seedRepo(NAME, {
    "index.json": serializeIndex(
      createEmptyIndex(NAME, { maxFileBytes: PART, maxRepoBytes }),
    ),
  });
  library = new LibraryRepo(new GithubApi(fake.token, fake.fetch), fake.login, NAME);
};

beforeEach(() => start());

const savedIndex = () => parseIndex(fake.fileText(NAME, "index.json")!);
const manifestOf = (id: string) =>
  JSON.parse(fake.fileText(NAME, `manifests/${id}.json`)!) as Manifest;

const readPart = (part: { repo: string; sha: string }) =>
  library.api.readBlob(fake.login, part.repo, part.sha);

describe("splitBlob", () => {
  it("cuts into full parts and a short last part", async () => {
    const parts = splitBlob(new Blob([randomBytes(250)]), 100);
    expect(parts.map((p) => p.size)).toEqual([100, 100, 50]);
  });

  it("does not add an empty part for an exact multiple", () => {
    expect(splitBlob(new Blob([randomBytes(200)]), 100)).toHaveLength(2);
  });

  it("gives an empty file a single part", () => {
    expect(splitBlob(new Blob([]), 100)).toHaveLength(1);
  });

  it("joins back to the same bytes", async () => {
    const bytes = randomBytes(777, 9);
    const joined = joinParts(splitBlob(new Blob([bytes]), 100), "a.bin", "x/y");
    expect(new Uint8Array(await joined.arrayBuffer())).toEqual(bytes);
  });
});

describe("uploadTrack", () => {
  it("stores a small track as one part with a manifest and index entry", async () => {
    const bytes = randomBytes(60);
    const before = fake.commitCount(NAME);

    const entry = await uploadTrack(library, meta("ab1"), {
      media: makeFile("song.mp3", bytes),
    });

    expect(fake.commitCount(NAME)).toBe(before + 1); // one commit for everything
    expect(entry.sha256).toHaveLength(64);
    const manifest = manifestOf("ab1");
    expect(manifest.media.parts).toHaveLength(1);
    expect(manifest.media.name).toBe("song.mp3");
    expect(fake.fileBytes(NAME, manifest.media.parts[0].path)).toEqual(bytes);
    expect(savedIndex().tracks.map((t) => t.id)).toEqual(["ab1"]);
    expect(savedIndex().repos[0].usedBytes).toBe(60);
  });

  it("splits a file larger than the part size and restores it exactly", async () => {
    const bytes = randomBytes(250, 5);

    await uploadTrack(library, meta("cd2"), {
      media: makeFile("big.mp4", bytes, "video/mp4"),
    });

    const manifest = manifestOf("cd2");
    expect(manifest.media.parts.map((p) => p.bytes)).toEqual([100, 100, 50]);

    const files = await fetchTrackFiles(manifest, readPart);
    expect(files.media.name).toBe("big.mp4");
    expect(files.media.type).toBe("video/mp4");
    expect(new Uint8Array(await files.media.arrayBuffer())).toEqual(bytes);
  });

  it("uploads a cover and counts its bytes", async () => {
    await uploadTrack(library, meta("ef3"), {
      media: makeFile("s.mp3", randomBytes(40)),
      cover: makeFile("c.jpg", randomBytes(30, 2), "image/jpeg"),
    });

    const manifest = manifestOf("ef3");
    expect(manifest.cover?.parts).toHaveLength(1);
    expect(savedIndex().repos[0].usedBytes).toBe(70);

    const files = await fetchTrackFiles(manifest, readPart);
    expect(files.cover?.size).toBe(30);
  });

  it("skips a track that is already uploaded unchanged", async () => {
    const files = { media: makeFile("s.mp3", randomBytes(40)) };
    await uploadTrack(library, meta("gh4"), files);
    const commits = fake.commitCount(NAME);
    const writes = fake.requests.filter((r) => r.startsWith("POST")).length;

    await uploadTrack(library, meta("gh4"), files);

    expect(fake.commitCount(NAME)).toBe(commits);
    expect(fake.requests.filter((r) => r.startsWith("POST")).length).toBe(writes);
  });

  it("uploads again when the content changed", async () => {
    await uploadTrack(library, meta("ij5"), { media: makeFile("s.mp3", randomBytes(40, 1)) });
    await uploadTrack(library, meta("ij5"), { media: makeFile("s.mp3", randomBytes(40, 2)) });

    expect(savedIndex().tracks).toHaveLength(1);
    const manifest = manifestOf("ij5");
    expect(fake.fileBytes(NAME, manifest.media.parts[0].path)).toEqual(randomBytes(40, 2));
  });

  it("keeps both tracks when another device adds one at the same time", async () => {
    await uploadTrack(library, meta("kl6"), { media: makeFile("a.mp3", randomBytes(10)) });
    fake.onNextRefUpdate(async () => {
      const current = savedIndex();
      await fake.pushFiles(NAME, {
        "index.json": serializeIndex({
          ...current,
          tracks: [...current.tracks, { ...meta("theirs"), manifest: "manifests/theirs.json" }],
        }),
      });
    });

    await uploadTrack(library, meta("mn7"), { media: makeFile("b.mp3", randomBytes(10)) });

    expect(savedIndex().tracks.map((t) => t.id).sort()).toEqual(["kl6", "mn7", "theirs"]);
  });

  it("refuses when the repo has no room, and commits nothing", async () => {
    await start(150);
    const commits = fake.commitCount(NAME);

    await expect(
      uploadTrack(library, meta("op8"), { media: makeFile("x.bin", randomBytes(200)) }),
    ).rejects.toBeInstanceOf(RepoFullError);

    expect(fake.commitCount(NAME)).toBe(commits);
    expect(savedIndex().tracks).toEqual([]);
  });

  it("reports progress for each part", async () => {
    const seen: number[] = [];
    await uploadTrack(
      library,
      meta("qr9"),
      { media: makeFile("x.bin", randomBytes(250)) },
      { onProgress: (done, total) => seen.push(done * 10 + total) },
    );
    expect(seen).toEqual([13, 23, 33]);
  });
});

describe("fetchTrackFiles", () => {
  it("rejects a part with the wrong size", async () => {
    await uploadTrack(library, meta("st1"), { media: makeFile("s.mp3", randomBytes(50)) });

    await expect(
      fetchTrackFiles(manifestOf("st1"), async () => new Blob([randomBytes(10)])),
    ).rejects.toBeInstanceOf(IntegrityError);
  });

  it("rejects content that does not match the hash", async () => {
    await uploadTrack(library, meta("uv2"), { media: makeFile("s.mp3", randomBytes(50, 1)) });

    await expect(
      fetchTrackFiles(manifestOf("uv2"), async () => new Blob([randomBytes(50, 99)])),
    ).rejects.toBeInstanceOf(IntegrityError);
  });
});
