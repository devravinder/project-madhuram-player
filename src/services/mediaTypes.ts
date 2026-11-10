import type { MediaKind } from "@/types/music";

// Browsers often report no MIME type for these, so the extension decides.
const MIME_BY_EXTENSION: Record<string, { kind: MediaKind; mime: string }> = {
  mp3: { kind: "audio", mime: "audio/mpeg" },
  m4a: { kind: "audio", mime: "audio/mp4" },
  aac: { kind: "audio", mime: "audio/aac" },
  flac: { kind: "audio", mime: "audio/flac" },
  ogg: { kind: "audio", mime: "audio/ogg" },
  oga: { kind: "audio", mime: "audio/ogg" },
  opus: { kind: "audio", mime: "audio/ogg" },
  wav: { kind: "audio", mime: "audio/wav" },
  weba: { kind: "audio", mime: "audio/webm" },
  mp4: { kind: "video", mime: "video/mp4" },
  m4v: { kind: "video", mime: "video/mp4" },
  mov: { kind: "video", mime: "video/quicktime" },
  webm: { kind: "video", mime: "video/webm" },
  ogv: { kind: "video", mime: "video/ogg" },
  mkv: { kind: "video", mime: "video/x-matroska" },
};

export const MEDIA_ACCEPT = [
  ...Object.keys(MIME_BY_EXTENSION).map((ext) => `.${ext}`),
  "audio/*",
  "video/*",
].join(",");

export const MEDIA_FORMATS_LABEL =
  "MP3, M4A, AAC, FLAC, OGG, OPUS, WAV, MP4, WEBM, MOV, MKV";

const extensionOf = (name: string) =>
  name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";

export function mediaKindOf(file: File): MediaKind | undefined {
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return MIME_BY_EXTENSION[extensionOf(file.name)]?.kind;
}

// Gives a file without a type the one its extension implies.
export function withMediaType(file: File): File {
  if (file.type) return file;
  const mime = MIME_BY_EXTENSION[extensionOf(file.name)]?.mime;
  return mime ? new File([file], file.name, { type: mime }) : file;
}

export const canPlayInBrowser = (file: File, kind: MediaKind) =>
  document.createElement(kind).canPlayType(file.type) !== "";
