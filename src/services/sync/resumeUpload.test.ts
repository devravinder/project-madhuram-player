import db from "@/services/db";
import { GithubApi } from "@/services/github/api";
import { findOrCreateLibrary } from "@/services/github/discovery";
import { parseIndex, type Manifest } from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";
import type { TrackMeta } from "@/services/storage/types";
import { FakeGithub } from "@/testing/fakeGithub";
import { makeFile, randomBytes } from "@/testing/files";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTrackFiles } from "./download";
import { uploadTrack } from "./upload";

const NAME = "music-library";
const noSleep = async () => {};
const meta = (id: string): TrackMeta => ({
  id,
  kind: "video",
  title: id,
  artist: "",
  album: "",
  duration: 1,
  mime: "video/mp4",
  bytes: 0,
  addedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

let fake: FakeGithub;
let cutAfterParts = Infinity; // the connection drops after this many parts
let partsSent = 0;
let library: LibraryRepo;

beforeEach(async () => {
  await db.uploadedParts.clear();
  fake = new FakeGithub();
  cutAfterParts = Infinity;
  partsSent = 0;
  const api = new GithubApi(fake.token, fake.fetch);
  // Counts the media parts sent, and drops the connection on cue.
  const send = api.createBlob.bind(api);
  vi.spyOn(api, "createBlob").mockImplementation(async (...args) => {
    if (partsSent >= cutAfterParts) throw new TypeError("Failed to fetch");
    partsSent++;
    return send(...args);
  });
  // Parts of 100 bytes, so a 350-byte file has four.
  const found = await findOrCreateLibrary(
    api,
    fake.login,
    NAME,
    { maxFileBytes: 100, maxRepoBytes: 10_000 },
    noSleep,
  );
  if (found.status === "name-taken") throw new Error("unexpected");
  library = new LibraryRepo(api, fake.login, NAME, found.branch, noSleep);
});

const video = randomBytes(350, 5);
const upload = () =>
  uploadTrack(
    library,
    meta("v1"),
    { media: makeFile("v.mp4", video, "video/mp4") },
    { sleep: noSleep },
  );

async function downloaded() {
  const entry = parseIndex(fake.fileText(NAME, "index.json")!).tracks.find(
    (t) => t.id === "v1",
  )!;
  const manifest = JSON.parse(fake.fileText(NAME, entry.manifest)!) as Manifest;
  const files = await fetchTrackFiles(manifest, (part) =>
    library.api.readBlob(fake.login, part.repo, part.sha),
  );
  return new Uint8Array(await files.media.arrayBuffer());
}

describe("an upload that stops partway", () => {
  it("carries on from the first part GitHub does not have", async () => {
    cutAfterParts = 2;
    await expect(upload()).rejects.toThrow();
    expect(await db.uploadedParts.count()).toBe(2);
    expect(parseIndex(fake.fileText(NAME, "index.json")!).tracks).toEqual([]); // not half-added

    cutAfterParts = Infinity;
    partsSent = 0;
    await upload();

    expect(partsSent).toBe(2); // only the two missing parts
    expect(await downloaded()).toEqual(video);
    expect(await db.uploadedParts.count()).toBe(0); // done, nothing left to resume
  });

  it("sends everything again when the file changed meanwhile", async () => {
    cutAfterParts = 2;
    await expect(upload()).rejects.toThrow();

    cutAfterParts = Infinity;
    partsSent = 0;
    const edited = randomBytes(350, 9);
    await uploadTrack(
      library,
      meta("v1"),
      { media: makeFile("v.mp4", edited, "video/mp4") },
      { sleep: noSleep },
    );

    expect(partsSent).toBe(4);
    expect(await downloaded()).toEqual(edited);
  });

  it("sends the parts again if GitHub no longer has them", async () => {
    cutAfterParts = 2;
    await expect(upload()).rejects.toThrow();
    // As if GitHub cleaned up the parts nothing pointed to.
    for (const part of await db.uploadedParts.toArray()) {
      await db.uploadedParts.put({ ...part, sha: "0".repeat(40) });
    }

    cutAfterParts = Infinity;
    await expect(upload()).rejects.toThrow(); // the commit names missing blobs
    expect(await db.uploadedParts.count()).toBe(0);

    partsSent = 0;
    await upload();
    expect(partsSent).toBe(4);
    expect(await downloaded()).toEqual(video);
  });

  it("does not remember anything for a finished upload", async () => {
    const spy = vi.spyOn(db.uploadedParts, "put");
    await upload();
    expect(spy).toHaveBeenCalledTimes(4);
    expect(await db.uploadedParts.count()).toBe(0);
  });
});
