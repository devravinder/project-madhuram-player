import db from "@/services/db";
import { GithubApi } from "@/services/github/api";
import { findOrCreateLibrary } from "@/services/github/discovery";
import {
  parseIndex,
  type Manifest,
  type PartRef,
} from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";
import { FakeGithub } from "@/testing/fakeGithub";
import { makeFile, randomBytes } from "@/testing/files";
import { beforeEach, describe, expect, it } from "vitest";
import {
  dropOldDownloadedParts,
  fetchTrackFiles,
  IntegrityError,
} from "./download";
import { uploadTrack } from "./upload";

const NAME = "music-library";
const noSleep = async () => {};
const video = randomBytes(350, 5); // four parts of 100 bytes

let library: LibraryRepo;
let manifest: Manifest;
let reads = 0;
let cutAfter = Infinity; // the connection drops after this many parts

const readPart = async (part: PartRef) => {
  if (reads >= cutAfter) throw new TypeError("Failed to fetch");
  reads++;
  return library.api.readBlob(library.owner, part.repo, part.sha);
};
const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

beforeEach(async () => {
  await db.downloadedParts.clear();
  reads = 0;
  cutAfter = Infinity;
  const fake = new FakeGithub();
  const api = new GithubApi(fake.token, fake.fetch);
  const found = await findOrCreateLibrary(
    api,
    fake.login,
    NAME,
    { maxFileBytes: 100, maxRepoBytes: 10_000 },
    noSleep,
  );
  if (found.status === "name-taken") throw new Error("unexpected");
  library = new LibraryRepo(api, fake.login, NAME, found.branch, noSleep);
  await uploadTrack(
    library,
    {
      id: "v1",
      kind: "video",
      title: "v1",
      artist: "",
      album: "",
      duration: 1,
      mime: "video/mp4",
      bytes: 0,
      addedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    { media: makeFile("v.mp4", video, "video/mp4") },
    { sleep: noSleep },
  );
  const entry = parseIndex(fake.fileText(NAME, "index.json")!).tracks[0];
  manifest = JSON.parse(fake.fileText(NAME, entry.manifest)!) as Manifest;
  expect(manifest.media.parts).toHaveLength(4);
});

describe("a download that stops partway", () => {
  it("carries on with the parts still missing", async () => {
    cutAfter = 2;
    await expect(fetchTrackFiles(manifest, readPart)).rejects.toThrow();
    expect(await db.downloadedParts.count()).toBe(2);

    cutAfter = Infinity;
    reads = 0;
    const files = await fetchTrackFiles(manifest, readPart);

    expect(reads).toBe(2); // only the two missing parts
    expect(await bytesOf(files.media)).toEqual(video);
    expect(await db.downloadedParts.count()).toBe(0); // done, nothing kept
  });

  it("fetches every part again when a kept part turns out to be wrong", async () => {
    cutAfter = 2;
    await expect(fetchTrackFiles(manifest, readPart)).rejects.toThrow();
    const [first] = await db.downloadedParts.toArray();
    await db.downloadedParts.put({
      ...first,
      data: new Blob([randomBytes(100, 99)]),
    });

    cutAfter = Infinity;
    await expect(fetchTrackFiles(manifest, readPart)).rejects.toBeInstanceOf(
      IntegrityError,
    );
    expect(await db.downloadedParts.count()).toBe(0);

    reads = 0;
    expect(
      await bytesOf((await fetchTrackFiles(manifest, readPart)).media),
    ).toEqual(video);
    expect(reads).toBe(4);
  });

  it("drops parts of a download nobody finished within a week", async () => {
    cutAfter = 2;
    await expect(fetchTrackFiles(manifest, readPart)).rejects.toThrow();

    await dropOldDownloadedParts(Date.now() + 6 * 24 * 3600 * 1000);
    expect(await db.downloadedParts.count()).toBe(2);
    await dropOldDownloadedParts(Date.now() + 8 * 24 * 3600 * 1000);
    expect(await db.downloadedParts.count()).toBe(0);
  });
});
