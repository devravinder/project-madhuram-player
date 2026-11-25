import { describe, expect, it } from "vitest";
import { downloadName } from "./saveToDisk";

const file = (name: string, type = "") =>
  new File([new Uint8Array(1)], name, { type });

describe("downloadName", () => {
  it("uses the title and the file's own extension", () => {
    expect(
      downloadName({ title: "My Song", kind: "audio" }, file("track01.MP3")),
    ).toBe("My Song.mp3");
    expect(downloadName({ title: "Clip", kind: "video" }, file("a.mp4"))).toBe(
      "Clip.mp4",
    );
  });

  it("falls back to the type, then to the kind", () => {
    expect(
      downloadName({ title: "A", kind: "audio" }, file("blob", "audio/mp4")),
    ).toBe("A.m4a");
    expect(downloadName({ title: "V", kind: "video" }, file("blob"))).toBe(
      "V.mp4",
    );
    expect(downloadName({ title: "S", kind: "audio" }, file("blob"))).toBe(
      "S.mp3",
    );
  });

  it("removes characters file systems refuse", () => {
    expect(
      downloadName({ title: 'AC/DC: "Live?"', kind: "audio" }, file("x.mp3")),
    ).toBe("AC DC Live.mp3");
    expect(downloadName({ title: "///", kind: "audio" }, file("x.mp3"))).toBe(
      "song.mp3",
    );
  });
});
