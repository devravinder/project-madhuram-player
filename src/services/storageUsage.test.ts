import { afterEach, describe, expect, it, vi } from "vitest";
import { formatBytes, readDeviceUsage, requestPersistence } from "./storageUsage";

const stubStorage = (storage: Partial<StorageManager> | undefined) =>
  vi.stubGlobal("navigator", { storage });

afterEach(() => vi.unstubAllGlobals());

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1536, "1.5 KB"],
    [50 * 1024 * 1024, "50.0 MB"],
    [800 * 1024 * 1024, "800 MB"],
    [3 * 1024 ** 4, "3.0 TB"],
  ])("formats %d", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

describe("readDeviceUsage", () => {
  it("reports usage, quota and persistence", async () => {
    stubStorage({
      estimate: async () => ({ usage: 100, quota: 1000 }),
      persisted: async () => true,
      persist: async () => true,
    });
    expect(await readDeviceUsage()).toEqual({
      usedBytes: 100,
      quotaBytes: 1000,
      persisted: true,
      canPersist: true,
    });
  });

  it("copes with a browser without the storage API", async () => {
    stubStorage(undefined);
    expect(await readDeviceUsage()).toEqual({ persisted: false, canPersist: false });
  });

  it("copes with estimate failing", async () => {
    stubStorage({
      estimate: () => Promise.reject(new Error("blocked")),
      persisted: async () => false,
    });
    expect(await readDeviceUsage()).toMatchObject({ usedBytes: undefined, persisted: false, canPersist: false });
  });
});

describe("requestPersistence", () => {
  it("returns what the browser granted", async () => {
    stubStorage({ persist: async () => true });
    expect(await requestPersistence()).toBe(true);
  });

  it("returns false when refused or unsupported", async () => {
    stubStorage({ persist: () => Promise.reject(new Error("no")) });
    expect(await requestPersistence()).toBe(false);
    stubStorage(undefined);
    expect(await requestPersistence()).toBe(false);
  });
});
