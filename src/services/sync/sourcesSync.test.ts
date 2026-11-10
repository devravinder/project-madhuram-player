import db from "@/services/db";
import { GithubApi } from "@/services/github/api";
import { findOrCreateLibrary } from "@/services/github/discovery";
import { LibraryRepo } from "@/services/github/library";
import { parseIndex } from "@/services/github/indexTypes";
import {
  followSource,
  InvalidAddressError,
  listSources,
  normalizeAddress,
  unfollowSource,
} from "@/services/public/sourcesService";
import { FakeGithub } from "@/testing/fakeGithub";
import { beforeEach, describe, expect, it } from "vitest";
import { mergeSources, syncSources } from "./sourcesSync";

const OLD = "2026-01-01T00:00:00.000Z";
const NEW = "2026-02-01T00:00:00.000Z";

describe("normalizeAddress", () => {
  it("stores one spelling for the same library", () => {
    expect(normalizeAddress("Alice/Music")).toBe("alice/music");
    expect(normalizeAddress("https://github.com/Alice/Music.git")).toBe("alice/music");
  });

  it("rejects what is not an address", () => {
    expect(() => normalizeAddress("nonsense")).toThrow(InvalidAddressError);
  });
});

describe("mergeSources", () => {
  it("adds sources the other side lacks", () => {
    const r = mergeSources([{ address: "a/x", updatedAt: OLD }], [{ address: "b/y", updatedAt: OLD }]);
    expect(r.remote.map((s) => s.address)).toEqual(["a/x", "b/y"]);
    expect(r.upsert.map((s) => s.address)).toEqual(["b/y"]);
    expect(r.remoteChanged).toBe(true);
  });

  it("lets a later unfollow beat an earlier follow", () => {
    const r = mergeSources(
      [{ address: "a/x", updatedAt: NEW, removed: true }],
      [{ address: "a/x", updatedAt: OLD }],
    );
    expect(r.remote[0]).toMatchObject({ removed: true });
    expect(r.remoteChanged).toBe(true);
  });

  it("lets a later follow bring back an earlier unfollow", () => {
    const r = mergeSources(
      [{ address: "a/x", updatedAt: OLD, removed: true }],
      [{ address: "a/x", updatedAt: NEW }],
    );
    expect(r.upsert[0].removed).toBeUndefined();
    expect(r.remoteChanged).toBe(false);
  });

  it("changes nothing when both sides agree", () => {
    const same = [{ address: "a/x", updatedAt: OLD }];
    expect(mergeSources(same, same)).toMatchObject({ upsert: [], remoteChanged: false });
  });
});

describe("syncSources", () => {
  let fake: FakeGithub;
  let library: LibraryRepo;

  beforeEach(async () => {
    await db.followedSources.clear();
    fake = new FakeGithub();
    const api = new GithubApi(fake.token, fake.fetch);
    const found = await findOrCreateLibrary(api, fake.login, "lib", { maxFileBytes: 100, maxRepoBytes: 1000 }, async () => {});
    if (found.status === "name-taken") throw new Error("unexpected");
    library = new LibraryRepo(api, fake.login, "lib", found.branch);
  });

  const remote = () => parseIndex(fake.fileText("lib", "index.json")!).sources;

  it("stores follows in the library and brings them to a new device", async () => {
    await followSource("alice/music");
    await syncSources(library);
    expect(remote().map((s) => s.address)).toEqual(["alice/music"]);

    await db.followedSources.clear(); // a new device
    await syncSources(library);
    expect((await listSources()).map((s) => s.address)).toEqual(["alice/music"]);
  });

  it("carries an unfollow to the other device", async () => {
    await followSource("alice/music");
    await syncSources(library);
    const deviceA = await db.followedSources.toArray();

    await unfollowSource("alice/music"); // device B
    await syncSources(library);

    await db.followedSources.clear(); // back on device A
    await db.followedSources.bulkPut(deviceA);
    await syncSources(library);

    expect(await listSources()).toEqual([]);
  });

  it("does not commit when nothing changed", async () => {
    await followSource("alice/music");
    await syncSources(library);
    const commits = fake.commitCount("lib");

    const result = await syncSources(library);

    expect(result).toEqual({ pushed: false, pulled: 0 });
    expect(fake.commitCount("lib")).toBe(commits);
  });

  it("lists only sources that are still followed", async () => {
    await followSource("a/x");
    await followSource("b/y");
    await unfollowSource("a/x");
    expect((await listSources()).map((s) => s.address)).toEqual(["b/y"]);
  });
});