import type { TrackMeta } from "@/services/storage/types";
import { fetchTrackFiles } from "@/services/sync/download";
import { uploadTrack } from "@/services/sync/upload";
import { FakeGithub } from "@/testing/fakeGithub";
import { makeFile, randomBytes } from "@/testing/files";
import { beforeEach, describe, expect, it } from "vitest";
import { GithubApi } from "./api";
import {
  createEmptyIndex,
  parseIndex,
  serializeIndex,
  type Manifest,
} from "./indexTypes";
import { LibraryRepo } from "./library";
import { recoverShards, SHARD_MARKER_PATH } from "./shards";

const NAME = "project-music-files";
const PART = 100;
const REPO_LIMIT = 250;
const noSleep = async () => {};

const meta = (id: string): TrackMeta => ({
  id,
  kind: "audio",
  title: `Song ${id}`,
  artist: "",
  album: "",
  duration: 1,
  mime: "audio/mpeg",
  bytes: 0,
  addedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const marker = (library = NAME) =>
  JSON.stringify({ app: "madhuram", role: "shard", library });

let fake: FakeGithub;
let library: LibraryRepo;

beforeEach(async () => {
  fake = new FakeGithub();
  await fake.seedRepo(NAME, {
    "index.json": serializeIndex(
      createEmptyIndex(NAME, { maxFileBytes: PART, maxRepoBytes: REPO_LIMIT }),
    ),
  });
  library = new LibraryRepo(new GithubApi(fake.token, fake.fetch), fake.login, NAME);
});

const index = () => parseIndex(fake.fileText(NAME, "index.json")!);
const upload = (id: string, size: number, seed = 1) =>
  uploadTrack(library, meta(id), { media: makeFile(`${id}.bin`, randomBytes(size, seed)) }, { sleep: noSleep });
const manifestOf = (id: string) =>
  JSON.parse(fake.fileText(NAME, `manifests/${id}.json`)!) as Manifest;

describe("rollover", () => {
  it("starts a private shard repo with a marker when the repo is full", async () => {
    await upload("aa1", 200); // 200 of 250 used
    await upload("bb2", 100); // does not fit: needs a shard

    const saved = index();
    expect(saved.repos.map((r) => r.name)).toEqual([NAME, `${NAME}-part-1`]);
    expect(saved.currentRepo).toBe(`${NAME}-part-1`);
    expect(fake.repos.get(`${NAME}-part-1`)?.private).toBe(true);
    expect(JSON.parse(fake.fileText(`${NAME}-part-1`, SHARD_MARKER_PATH)!)).toEqual({
      app: "madhuram",
      role: "shard",
      library: NAME,
    });
    expect(manifestOf("bb2").media.parts[0].repo).toBe(`${NAME}-part-1`);
  });

  it("spreads one large file across repos and restores it exactly", async () => {
    const bytes = randomBytes(400, 7);

    await uploadTrack(
      library,
      meta("cc3"),
      { media: makeFile("big.bin", bytes) },
      { sleep: noSleep },
    );

    const manifest = manifestOf("cc3");
    const repos = new Set(manifest.media.parts.map((p) => p.repo));
    expect(repos).toEqual(new Set([NAME, `${NAME}-part-1`]));
    expect(fake.repos.size).toBe(2);

    const files = await fetchTrackFiles(manifest, (part) =>
      library.api.readBlob(fake.login, part.repo, part.sha),
    );
    expect(new Uint8Array(await files.media.arrayBuffer())).toEqual(bytes);
  });

  it("counts each repo's bytes separately", async () => {
    await upload("dd4", 400);
    const total = index().repos.reduce((sum, r) => sum + r.usedBytes, 0);
    expect(total).toBe(400);
    expect(index().repos.every((r) => r.usedBytes <= REPO_LIMIT)).toBe(true);
  });

  it("marks a repo full only once it cannot take another part", async () => {
    await upload("ee5", 200); // primary: 50 left, less than one part
    await upload("ff6", 100); // forces rollover

    const primary = index().repos.find((r) => r.name === NAME)!;
    expect(primary.full).toBe(true);
  });

  it("keeps using leftover space in an earlier repo", async () => {
    await upload("gg7", 100); // primary: 150 left
    await upload("hh8", 400); // rollover; spans both repos
    const before = index().repos.find((r) => r.name === NAME)!.usedBytes;

    expect(before).toBeGreaterThan(100); // the big file also used primary
  });

  it("names later shards in sequence", async () => {
    await upload("ii9", 250);
    await upload("jj0", 250);
    await upload("kk1", 250);

    expect(index().repos.map((r) => r.name)).toEqual([
      NAME,
      `${NAME}-part-1`,
      `${NAME}-part-2`,
    ]);
  });

  it("adopts a marked shard left behind by a lost update", async () => {
    await fake.seedRepo(`${NAME}-part-1`, { [SHARD_MARKER_PATH]: marker() });
    await upload("ll2", 250);

    await upload("mm3", 100);

    expect(index().repos.map((r) => r.name)).toEqual([NAME, `${NAME}-part-1`]);
    expect(fake.repos.size).toBe(2);
  });

  it("skips a same-named repo that belongs to something else", async () => {
    await fake.seedRepo(`${NAME}-part-1`, { "app.ts": "someone else's code" });
    await upload("nn4", 250);

    await upload("oo5", 100);

    expect(index().currentRepo).toBe(`${NAME}-part-2`);
    expect(fake.paths(`${NAME}-part-1`)).toEqual(["app.ts"]);
  });
});

describe("recoverShards", () => {
  it("adds marked shards missing from the index and ignores the rest", async () => {
    await fake.seedRepo(`${NAME}-part-1`, { [SHARD_MARKER_PATH]: marker(), "data/x": "x".repeat(2048) });
    await fake.seedRepo(`${NAME}-part-2`, { "other.txt": "unmarked" });
    await fake.seedRepo(`${NAME}-part-3`, { [SHARD_MARKER_PATH]: marker() });
    await fake.seedRepo(`${NAME}-part-4`, { [SHARD_MARKER_PATH]: marker("another-library") });
    await fake.seedRepo("unrelated", { "a.txt": "a" });

    const recovered = await recoverShards(library);

    expect(recovered.sort()).toEqual([`${NAME}-part-1`, `${NAME}-part-3`]);
    expect(index().repos.map((r) => r.name)).toEqual([NAME, `${NAME}-part-1`, `${NAME}-part-3`]);
    expect(index().repos.find((r) => r.name === `${NAME}-part-1`)!.usedBytes).toBeGreaterThan(1500);
  });

  it("does nothing when everything is already listed", async () => {
    await fake.seedRepo(`${NAME}-part-1`, { [SHARD_MARKER_PATH]: marker() });
    await recoverShards(library);
    const commits = fake.commitCount(NAME);

    expect(await recoverShards(library)).toEqual([]);
    expect(fake.commitCount(NAME)).toBe(commits);
  });
});
