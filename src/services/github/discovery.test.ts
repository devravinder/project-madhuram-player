import { FakeGithub } from "@/testing/fakeGithub";
import { describe, expect, it, vi } from "vitest";
import { GithubApi } from "./api";
import { findOrCreateLibrary } from "./discovery";
import {
  createEmptyIndex,
  parseIndex,
  serializeIndex,
  UnsupportedIndexVersionError,
} from "./indexTypes";

const config = { maxFileBytes: 50, maxRepoBytes: 800 };
const NAME = "project-music-files";

const setup = () => {
  const fake = new FakeGithub();
  const api = new GithubApi(fake.token, fake.fetch);
  const run = (sleep = vi.fn().mockResolvedValue(undefined)) =>
    findOrCreateLibrary(api, fake.login, NAME, config, sleep);
  return { fake, api, run };
};

const writes = (fake: FakeGithub) =>
  fake.requests.filter((r) => /^(POST|PUT|PATCH)/.test(r));

describe("findOrCreateLibrary", () => {
  it("creates a private repo with an index when none exists", async () => {
    const { fake, run } = setup();

    const result = await run();

    expect(result.status).toBe("created");
    expect(fake.repos.get(NAME)?.private).toBe(true);
    const saved = parseIndex(fake.fileText(NAME, "index.json")!);
    expect(saved.currentRepo).toBe(NAME);
    expect(saved.config).toEqual(config);
    expect(fake.paths(NAME)).toContain("README.md");
  });

  it("waits until the new repo can be read", async () => {
    const { fake, run } = setup();
    fake.lagRefLookups(2);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await run(sleep);

    expect(result.status).toBe("created");
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("reuses a marked library without writing anything", async () => {
    const { fake, run } = setup();
    const index = createEmptyIndex(NAME, config);
    index.tracks.push({
      id: "t1", kind: "audio", title: "Kept", artist: "", album: "", duration: 1,
      mime: "audio/mpeg", bytes: 1, addedAt: index.updatedAt, updatedAt: index.updatedAt,
      manifest: "manifests/t1.json",
    });
    await fake.seedRepo(NAME, { "index.json": serializeIndex(index) });
    fake.requests.length = 0;

    const result = await run();

    expect(result.status).toBe("reused");
    expect(result.status === "reused" && result.index.tracks[0].title).toBe("Kept");
    expect(writes(fake)).toEqual([]);
  });

  it("adopts a repo that only has a README", async () => {
    const { fake, run } = setup();
    await fake.seedRepo(NAME, { "README.md": "# hi" });

    const result = await run();

    expect(result.status).toBe("adopted");
    expect(fake.fileText(NAME, "README.md")).toBe("# hi");
    expect(parseIndex(fake.fileText(NAME, "index.json")!).app).toBe("madhuram");
  });

  it("adopts a repo with no commits at all", async () => {
    const { fake, run } = setup();
    fake.seedEmptyRepo(NAME);

    const result = await run();

    expect(result.status).toBe("adopted");
    expect(fake.paths(NAME)).toEqual(["index.json"]);
  });

  it("leaves a repo with other content untouched", async () => {
    const { fake, run } = setup();
    await fake.seedRepo(NAME, { "src/app.ts": "code", "README.md": "x" });
    fake.requests.length = 0;
    const commitsBefore = fake.commitCount(NAME);

    const result = await run();

    expect(result.status).toBe("name-taken");
    expect(writes(fake)).toEqual([]);
    expect(fake.commitCount(NAME)).toBe(commitsBefore);
    expect(fake.paths(NAME)).toEqual(["README.md", "src/app.ts"]);
  });

  it("does not take over an index.json that is not ours", async () => {
    const { fake, run } = setup();
    await fake.seedRepo(NAME, { "index.json": JSON.stringify({ name: "other" }) });
    fake.requests.length = 0;

    const result = await run();

    expect(result.status).toBe("name-taken");
    expect(writes(fake)).toEqual([]);
  });

  it("refuses a library written by a newer version", async () => {
    const { fake, run } = setup();
    const index = { ...createEmptyIndex(NAME, config), schemaVersion: 99 };
    await fake.seedRepo(NAME, { "index.json": serializeIndex(index) });

    await expect(run()).rejects.toBeInstanceOf(UnsupportedIndexVersionError);
  });
});
