import { FakeGithub } from "@/testing/fakeGithub";
import { HttpError, RateLimitError } from "@/services/httpError";
import { describe, expect, it } from "vitest";
import { GithubApi, isConflict } from "./api";
import { base64ToBytes, bytesToBase64 } from "./base64";

const setup = () => {
  const fake = new FakeGithub();
  return { fake, api: new GithubApi(fake.token, fake.fetch) };
};

describe("GithubApi", () => {
  it("reports a bad token as 401", async () => {
    const fake = new FakeGithub();
    const api = new GithubApi("wrong", fake.fetch);
    await expect(api.getUser()).rejects.toMatchObject({ status: 401 });
  });

  it("turns a rate limit into a wait time", async () => {
    const { fake, api } = setup();
    fake.limitNext(1);
    const error = await api.getUser().catch((e) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfterSeconds).toBe(7);
  });

  it("reports a network failure as status 0", async () => {
    const api = new GithubApi("t", () => Promise.reject(new TypeError("offline")));
    const error = await api.getUser().catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(0);
  });

  it("returns null for a missing repo and file", async () => {
    const { fake, api } = setup();
    await fake.seedRepo("lib", { "a.txt": "hi" });
    expect(await api.getRepo(fake.login, "nope")).toBeNull();
    expect(await api.getFile(fake.login, "lib", "missing.txt")).toBeNull();
    expect((await api.getFile(fake.login, "lib", "a.txt"))?.text).toBe("hi");
  });

  it("reads a file over 1 MB through its blob", async () => {
    const { fake, api } = setup();
    await fake.seedRepo("lib", { "big.json": "x".repeat(1_200_000) });
    const file = await api.getFile(fake.login, "lib", "big.json");
    expect(file?.text.length).toBe(1_200_000);
  });

  it("commits several changes at once and removes a path", async () => {
    const { fake, api } = setup();
    await fake.seedRepo("lib", { "old.txt": "old", "keep.txt": "keep" });
    const head = (await api.getHead(fake.login, "lib", "main"))!;
    const a = await api.createTextBlob(fake.login, "lib", "A");
    const b = await api.createBlob(fake.login, "lib", new Blob([new Uint8Array([1, 2, 3])]));

    await api.commitChanges(fake.login, "lib", head, "update", [
      { path: "dir/a.txt", sha: a },
      { path: "b.bin", sha: b },
      { path: "old.txt", sha: null },
    ]);

    expect(fake.paths("lib")).toEqual(["b.bin", "dir/a.txt", "keep.txt"]);
    expect(Array.from(fake.fileBytes("lib", "b.bin")!)).toEqual([1, 2, 3]);
  });

  it("detects a conflict when the branch moved", async () => {
    const { fake, api } = setup();
    await fake.seedRepo("lib", { "a.txt": "1" });
    const stale = (await api.getHead(fake.login, "lib", "main"))!;
    await fake.pushFiles("lib", { "other.txt": "x" });

    const blob = await api.createTextBlob(fake.login, "lib", "mine");
    const error = await api
      .commitChanges(fake.login, "lib", stale, "mine", [{ path: "m.txt", sha: blob }])
      .catch((e) => e);

    expect(isConflict(error)).toBe(true);
    expect(isConflict(new HttpError(500, "boom"))).toBe(false);
  });

  it("downloads blob bytes unchanged", async () => {
    const { fake, api } = setup();
    const bytes = new Uint8Array(3000).map((_, i) => i % 251);
    await fake.seedRepo("lib", { "x.bin": bytes });
    const head = (await api.getHead(fake.login, "lib", "main"))!;
    const entries = (await api.getRootEntries(fake.login, "lib", "main"))!;
    const sha = entries.find((e) => e.path === "x.bin")!.sha;
    expect(head.branch).toBe("main");
    const blob = await api.readBlob(fake.login, "lib", sha);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it("round-trips base64", () => {
    const bytes = new Uint8Array(70000).map((_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});
