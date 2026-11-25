import { GithubApi } from "@/services/github/api";
import { findOrCreateLibrary } from "@/services/github/discovery";
import { LibraryRepo } from "@/services/github/library";
import { uploadTrack } from "@/services/sync/upload";
import { FakeGithub } from "@/testing/fakeGithub";
import { makeFile, randomBytes } from "@/testing/files";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serveStream } from "./serveStream";
import { encodeStream, type StreamDescription } from "./streamPlan";

vi.mock("./streamClient", async (load) => ({
  ...(await load<typeof import("./streamClient")>()),
  canStream: async () => true,
}));

const bytes = randomBytes(250, 7);
const description: StreamDescription = {
  mime: "audio/mpeg",
  size: 250,
  parts: [
    { url: "https://raw.example/p0", bytes: 100 },
    { url: "https://raw.example/p1", bytes: 100 },
    { url: "https://raw.example/p2", bytes: 50 },
  ],
};
const partBytes = (url: string) => {
  const n = Number(url.slice(-1));
  return bytes.slice(n * 100, n * 100 + description.parts[n].bytes);
};

// Answers ranges like raw.githubusercontent.com does.
const rangeServer = (honoursRange = true): typeof fetch =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const data = partBytes(String(input));
    const range = new Headers(init?.headers).get("range");
    const match = range && /bytes=(\d+)-(\d+)/.exec(range);
    if (!honoursRange || !match) return new Response(data, { status: 200 });
    return new Response(data.slice(Number(match[1]), Number(match[2]) + 1), {
      status: 206,
    });
  }) as typeof fetch;

const link = (d: StreamDescription = description) =>
  new URL(`http://app.test/__stream?d=${encodeStream(d)}`);
const ask = (range: string | undefined, fetchFn: typeof fetch, url = link()) =>
  serveStream(
    new Request(url, { headers: range ? { Range: range } : {} }),
    url,
    fetchFn,
  );

// Reads the whole file the way a player does: one range after another.
async function playThrough(url: URL, fetchFn: typeof fetch) {
  const chunks: Uint8Array[] = [];
  let size = Infinity;
  for (let start = 0; start < size;) {
    const response = await ask(`bytes=${start}-`, fetchFn, url);
    expect(response.status).toBe(206);
    const [, from, to, total] = /bytes (\d+)-(\d+)\/(\d+)/.exec(
      response.headers.get("content-range")!,
    )!;
    expect(Number(from)).toBe(start);
    size = Number(total);
    const chunk = new Uint8Array(await response.arrayBuffer());
    expect(chunk.length).toBe(Number(to) - Number(from) + 1);
    chunks.push(chunk);
    start = Number(to) + 1;
  }
  return new Uint8Array(chunks.flatMap((c) => [...c]));
}

afterEach(() => vi.unstubAllGlobals());

describe("serveStream", () => {
  it("answers a range with just that piece, with the headers players need", async () => {
    const response = await ask("bytes=150-160", rangeServer());

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 150-160/250");
    expect(response.headers.get("content-length")).toBe("11");
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      bytes.slice(150, 161),
    );
  });

  it("fetches only the part that holds the bytes", async () => {
    const fetchFn = vi.fn(rangeServer());
    await ask("bytes=230-249", fetchFn);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(String(fetchFn.mock.calls[0][0])).toBe("https://raw.example/p2");
  });

  it("plays the whole file back exactly, even from a server that ignores ranges", async () => {
    expect(await playThrough(link(), rangeServer())).toEqual(bytes);
    expect(await playThrough(link(), rangeServer(false))).toEqual(bytes);
  });

  it("says when a range or link cannot be served", async () => {
    expect((await ask("bytes=300-", rangeServer())).status).toBe(416);
    const bad = new URL("http://app.test/__stream?d=nope");
    expect((await ask(undefined, rangeServer(), bad)).status).toBe(400);
    const missing = (async () =>
      new Response("", { status: 404 })) as typeof fetch;
    expect((await ask("bytes=0-", missing)).status).toBe(404);
    const offline = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect((await ask("bytes=0-", offline)).status).toBe(504);
  });
});

describe("a split song from a public library", () => {
  it("gets a stream link instead of a download, and plays back exactly", async () => {
    const fake = new FakeGithub();
    vi.stubGlobal("fetch", fake.fetch);
    const api = new GithubApi(fake.token, fake.fetch);
    const found = await findOrCreateLibrary(
      api,
      fake.login,
      "lib",
      { maxFileBytes: 100, maxRepoBytes: 10_000 },
      async () => {},
    );
    if (found.status === "name-taken") throw new Error("unexpected");
    const library = new LibraryRepo(api, fake.login, "lib", found.branch);
    const media = randomBytes(250, 3);
    await uploadTrack(
      library,
      {
        id: "big",
        kind: "audio",
        title: "Big",
        artist: "",
        album: "",
        duration: 1,
        mime: "audio/mpeg",
        bytes: 0,
        addedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      { media: makeFile("big.mp3", media) },
      { sleep: async () => {} },
    );
    fake.repos.get("lib")!.private = false;
    const { index } = await library.read();
    const { resolveRemote, toRemoteSong } =
      await import("@/services/public/remote");

    const playable = await resolveRemote(
      toRemoteSong(fake.login, "lib", index.tracks[0]),
    );

    expect(playable.mode).toBe("stream");
    const url = new URL(
      playable.mode === "stream" ? playable.url : "",
      "http://app.test/",
    );
    expect(url.pathname).toBe("/__stream");
    // The raw URLs answered from the fake, as GitHub serves public files.
    const raw: typeof fetch = (async (input: RequestInfo | URL) => {
      const [, , repo, , ...rest] = new URL(String(input)).pathname.split("/");
      const data = fake.fileBytes(repo, decodeURIComponent(rest.join("/")));
      return data
        ? new Response(data as BlobPart, { status: 200 })
        : new Response("", { status: 404 });
    }) as typeof fetch;
    expect(await playThrough(url, raw)).toEqual(media);
  });
});
