import { describe, expect, it } from "vitest";
import { gitBlobSha, sha256Hex } from "./hash";

describe("hash", () => {
  it("matches a known sha256", async () => {
    expect(await sha256Hex(new Blob(["abc"]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("matches git hash-object for a blob", async () => {
    // printf 'hello\n' | git hash-object --stdin
    expect(await gitBlobSha(new Blob(["hello\n"]))).toBe(
      "ce013625030ba8dba906f756967f9e9ca394464a",
    );
  });

  it("hashes an empty blob", async () => {
    // git's well-known empty blob id
    expect(await gitBlobSha(new Blob([]))).toBe(
      "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
    );
  });
});
