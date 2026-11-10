import { findOrCreateLibrary } from "@/services/github/discovery";
import { GithubApi } from "@/services/github/api";
import { LibraryRepo } from "@/services/github/library";
import type { TrackMeta } from "@/services/storage/types";
import { fetchTrackFiles } from "@/services/sync/download";
import { uploadTrack } from "@/services/sync/upload";
import { FakeGithub } from "@/testing/fakeGithub";
import { makeFile, randomBytes } from "@/testing/files";
import { beforeEach, describe, expect, it } from "vitest";
import {
  parseAddress,
  PublicLibrary,
  PublicLibraryError,
  TrackFileMissingError,
} from "./publicLibrary";

const NAME = "project-music-files";
const PART = 100;
const noSleep = async () => {};

const meta = (id: string): TrackMeta => ({
  id, kind: "audio", title: `Song ${id}`, artist: "", album: "", duration: 1,
  mime: "audio/mpeg", bytes: 0,
  addedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
});

let fake: FakeGithub;
let owner: LibraryRepo;

// The owner publishes tracks; a visitor reads them with no token.
beforeEach(async () => {
  fake = new FakeGithub();
  const api = new GithubApi(fake.token, fake.fetch);
  const found = await findOrCreateLibrary(api, fake.login, NAME, { maxFileBytes: PART, maxRepoBytes: 10_000 }, noSleep);
  if (found.status === "name-taken") throw new Error("unexpected");
  owner = new LibraryRepo(api, fake.login, NAME, found.branch);
  await uploadTrack(owner, meta("small1"), { media: makeFile("s.mp3", randomBytes(60)) }, { sleep: noSleep });
  await uploadTrack(owner, meta("large1"), { media: makeFile("l.mp3", randomBytes(250, 3)) }, { sleep: noSleep });
});

const visitor = () => new PublicLibrary({ owner: fake.login, repo: NAME }, fake.fetch);
const makePublic = () => (fake.repos.get(NAME)!.private = false);

describe("parseAddress", () => {
  it.each([
    ["alice/music", { owner: "alice", repo: "music" }],
    ["  alice/music  ", { owner: "alice", repo: "music" }],
    ["https://github.com/alice/music", { owner: "alice", repo: "music" }],
    ["https://github.com/alice/music.git", { owner: "alice", repo: "music" }],
    ["github.com/alice/music/", { owner: "alice", repo: "music" }],
    ["https://github.com/alice/music/tree/main", { owner: "alice", repo: "music" }],
  ])("reads %s", (input, expected) => {
    expect(parseAddress(input)).toEqual(expected);
  });

  it.each(["", "alice", "alice/", "/music", "al ice/music", "https://github.com/alice"])(
    "rejects %j",
    (input) => {
      expect(parseAddress(input)).toBeUndefined();
    },
  );
});
describe("PublicLibrary", () => {
  it("reads the track list with no sign-in", async () => {
    makePublic();
    const index = await visitor().loadIndex();
    expect(index.tracks.map((t) => t.id).sort()).toEqual(["large1", "small1"]);
  });

  it("cannot read a private library", async () => {
    const error = await visitor().loadIndex().catch((e) => e);
    expect(error).toBeInstanceOf(PublicLibraryError);
    expect(error.reason).toBe("not-found");
  });

  it("says when the repo is not a music library", async () => {
    await fake.seedRepo("other", { "index.json": '{"name":"x"}' }, false);
    const error = await new PublicLibrary({ owner: fake.login, repo: "other" }, fake.fetch)
      .loadIndex()
      .catch((e) => e);
    expect(error.reason).toBe("not-library");
  });

  it("reports offline", async () => {
    const lib = new PublicLibrary({ owner: "a", repo: "b" }, () => Promise.reject(new TypeError("x")));
    const error = await lib.loadIndex().catch((e) => e);
    expect(error.reason).toBe("offline");
  });

  it("carries on with a download cut off by switching apps", async () => {
    makePublic();
    let hidden = true; // the user is in another app
    let cut = 1;
    const lib = new PublicLibrary(
      { owner: fake.login, repo: NAME },
      (input, init) => (cut-- > 0 ? Promise.reject(new TypeError("cut")) : fake.fetch(input, init)),
      {
        visibility: {
          isHidden: () => hidden,
          hiddenTimes: () => 1,
          waitUntilVisible: async () => {
            hidden = false; // and comes back
          },
        },
        sleep: noSleep,
      },
    );

    const manifest = await lib.loadManifest("manifests/large1.json");
    expect(manifest.trackId).toBe("large1");
  });

  it("gives a stream URL for an unsplit file and none for a split one", async () => {
    makePublic();
    const lib = visitor();
    const small = await lib.loadManifest("manifests/small1.json");
    const large = await lib.loadManifest("manifests/large1.json");

    expect(lib.streamUrl(small.media)).toMatch(/^https:\/\/raw\.githubusercontent\.com\/.+\/HEAD\/data\//);
    expect(lib.streamUrl(large.media)).toBeUndefined();
    expect(lib.streamUrl(undefined)).toBeUndefined();
  });

  it("downloads a split file from the parts and verifies it", async () => {
    makePublic();
    const lib = visitor();
    const manifest = await lib.loadManifest("manifests/large1.json");

    const files = await fetchTrackFiles(manifest, lib.readPart);

    expect(new Uint8Array(await files.media.arrayBuffer())).toEqual(randomBytes(250, 3));
  });

  it("reports a removed file as missing", async () => {
    makePublic();
    const lib = visitor();
    const manifest = await lib.loadManifest("manifests/small1.json");
    manifest.media.parts[0].path = "data/gone/media.0";

    await expect(lib.readPart(manifest.media.parts[0])).rejects.toBeInstanceOf(TrackFileMissingError);
    await expect(lib.loadManifest("manifests/removed.json")).rejects.toBeInstanceOf(TrackFileMissingError);
  });

  it("uses no token and no API calls", async () => {
    makePublic();
    fake.requests.length = 0;
    await visitor().loadIndex();
    expect(fake.requests.every((r) => r.includes("raw:"))).toBe(true);
  });
});