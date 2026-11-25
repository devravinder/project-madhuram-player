import { describe, expect, it } from "vitest";
import {
  decodeStream,
  encodeStream,
  parseRange,
  planPiece,
  type StreamDescription,
} from "./streamPlan";

const file: StreamDescription = {
  mime: "video/mp4",
  size: 250,
  parts: [
    { url: "https://raw.githubusercontent.com/a/b/HEAD/p0", bytes: 100 },
    { url: "https://raw.githubusercontent.com/a/b/HEAD/p1", bytes: 100 },
    { url: "https://raw.githubusercontent.com/a/b/HEAD/p2", bytes: 50 },
  ],
};

describe("stream description", () => {
  it("survives the link round trip, names with spaces and all", () => {
    const named = {
      ...file,
      parts: file.parts.map((p) => ({ ...p, url: `${p.url}/ä b.mp4` })),
    };
    expect(decodeStream(encodeStream(named))).toEqual(named);
  });

  it("refuses anything that does not add up or is not https", () => {
    expect(decodeStream(null)).toBeUndefined();
    expect(decodeStream("not-base64!")).toBeUndefined();
    expect(decodeStream(encodeStream({ ...file, size: 999 }))).toBeUndefined();
    const plain = { ...file, parts: [{ url: "http://x/p", bytes: 250 }] };
    expect(decodeStream(encodeStream(plain))).toBeUndefined();
    const own = { ...file, parts: [{ url: "http://app.test/p", bytes: 250 }] };
    expect(decodeStream(encodeStream(own), "http://app.test")).toEqual(own);
    expect(
      decodeStream(encodeStream(own), "http://other.test"),
    ).toBeUndefined();
  });
});

describe("parseRange", () => {
  it("reads the forms players send", () => {
    expect(parseRange(null, 250)).toEqual({ start: 0, end: 249 });
    expect(parseRange("bytes=0-", 250)).toEqual({ start: 0, end: 249 });
    expect(parseRange("bytes=10-19", 250)).toEqual({ start: 10, end: 19 });
    expect(parseRange("bytes=200-999", 250)).toEqual({ start: 200, end: 249 });
    expect(parseRange("bytes=-30", 250)).toEqual({ start: 220, end: 249 });
  });

  it("refuses what cannot be served", () => {
    expect(parseRange("bytes=250-", 250)).toBeUndefined();
    expect(parseRange("bytes=20-10", 250)).toBeUndefined();
    expect(parseRange("bytes=-", 250)).toBeUndefined();
    expect(parseRange("items=0-1", 250)).toBeUndefined();
  });
});

describe("planPiece", () => {
  it("reads only from the part that holds the start", () => {
    expect(planPiece(file, 0, 249)).toEqual({
      part: 0,
      from: 0,
      to: 99,
      start: 0,
      end: 99,
    });
    expect(planPiece(file, 150, 249)).toEqual({
      part: 1,
      from: 50,
      to: 99,
      start: 150,
      end: 199,
    });
    expect(planPiece(file, 230, 249)).toEqual({
      part: 2,
      from: 30,
      to: 49,
      start: 230,
      end: 249,
    });
  });

  it("stops at the requested end and at the piece limit", () => {
    expect(planPiece(file, 120, 130)).toEqual({
      part: 1,
      from: 20,
      to: 30,
      start: 120,
      end: 130,
    });
    expect(planPiece(file, 100, 249, 10)).toEqual({
      part: 1,
      from: 0,
      to: 9,
      start: 100,
      end: 109,
    });
  });

  it("joins back to the whole file when followed piece by piece", () => {
    const covered: number[] = [];
    let start = 0;
    while (start < file.size) {
      const piece = planPiece(file, start, file.size - 1, 30);
      covered.push(piece.end - piece.start + 1);
      start = piece.end + 1;
    }
    expect(covered.reduce((a, b) => a + b, 0)).toBe(250);
  });

  it("refuses a start past the end", () => {
    expect(() => planPiece(file, 250, 260)).toThrow(RangeError);
  });
});
