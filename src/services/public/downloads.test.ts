import type { Song } from "@/types/music";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pending = new Map<string, { resolve: (id: string) => void; reject: (e: Error) => void }>();
vi.mock("./remote", () => ({
  downloadCopy: (song: Song) =>
    new Promise<string>((resolve, reject) => pending.set(song.id, { resolve, reject })),
}));

const song = (id: string): Song => ({
  id, title: id, artist: "", album: "", duration: 1, addedAt: new Date(), kind: "audio",
  mediaId: "", mime: "audio/mpeg", bytes: 1, remote: { owner: "Ann", repo: "Music", manifest: `m/${id}` },
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let downloads: typeof import("./downloads");
beforeEach(async () => {
  vi.resetModules();
  pending.clear();
  downloads = await import("./downloads");
});

describe("Explore downloads", () => {
  it("are remembered while they run, whoever is looking", async () => {
    const seen: boolean[] = [];
    downloads.subscribeDownloads(() => seen.push(downloads.getDownloads().songs.has("a")));

    const download = downloads.downloadSong(song("a"));
    await flush();
    expect(downloads.getDownloads().songs.has("a")).toBe(true);

    pending.get("a")!.resolve("a");
    await download;
    expect(downloads.getDownloads().songs.has("a")).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  it("join a download already running instead of starting another", async () => {
    const first = downloads.downloadSong(song("a"));
    const again = downloads.downloadSong(song("a"));
    expect(again).toBe(first);
    pending.get("a")!.resolve("a");
    await expect(again).resolves.toBe("a");
  });

  it("show the progress of download all, which can be stopped", async () => {
    const key = downloads.libraryKey(song("a"));
    expect(key).toBe("ann/music");
    const run = downloads.downloadAll(key, [song("a"), song("b"), song("c")]);
    await flush();
    expect(downloads.getDownloads().batches.get(key)).toEqual({ done: 0, total: 3 });
    expect(await downloads.downloadAll(key, [song("x")])).toBeUndefined(); // one at a time

    pending.get("a")!.reject(new Error("offline"));
    await flush();
    expect(downloads.getDownloads().batches.get(key)).toEqual({ done: 1, total: 3 });

    downloads.stopDownloadAll(key);
    pending.get("b")!.resolve("b");
    await expect(run).resolves.toEqual({ saved: 1, failed: 1, total: 3 });
    expect(pending.has("c")).toBe(false);
    expect(downloads.getDownloads().batches.size).toBe(0);
  });
});
