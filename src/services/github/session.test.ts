import { FakeGithub } from "@/testing/fakeGithub";
import { describe, expect, it } from "vitest";
import { LibraryNameTakenError, openLibrary } from "./session";

const config = { maxFileBytes: 50, maxRepoBytes: 800 };
const noSleep = async () => {};

const open = (fake: FakeGithub, repoName = "project-music-files") =>
  openLibrary({
    token: fake.token,
    login: fake.login,
    repoName,
    config,
    fetchFn: fake.fetch,
    sleep: noSleep,
  });

describe("openLibrary", () => {
  it("creates the library for a new account and can read it back", async () => {
    const fake = new FakeGithub();
    const { library, status } = await open(fake);

    expect(status).toBe("created");
    expect((await library.read()).index.config).toEqual(config);
  });

  it("reuses the library on the next sign-in", async () => {
    const fake = new FakeGithub();
    await open(fake);

    expect((await open(fake)).status).toBe("reused");
  });

  it("reports a name that belongs to another project", async () => {
    const fake = new FakeGithub();
    await fake.seedRepo("project-music-files", { "app.ts": "code" });

    await expect(open(fake)).rejects.toBeInstanceOf(LibraryNameTakenError);
  });

  it("works with another repo name after a clash", async () => {
    const fake = new FakeGithub();
    await fake.seedRepo("project-music-files", { "app.ts": "code" });

    const { status } = await open(fake, "my-music");
    expect(status).toBe("created");
    expect(fake.paths("project-music-files")).toEqual(["app.ts"]);
  });
});