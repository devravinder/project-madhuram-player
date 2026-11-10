// Browsers often report no MIME type for these, so the extension decides.
const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  weba: "audio/webm",
};

export const AUDIO_ACCEPT = [
  ...Object.keys(AUDIO_MIME_BY_EXTENSION).map((ext) => `.${ext}`),
  "audio/*",
].join(",");

export const AUDIO_FORMATS_LABEL = "MP3, M4A, AAC, FLAC, OGG, OPUS, WAV";

const extensionOf = (name: string) =>
  name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";

export const isAudioFile = (file: File) =>
  file.type.startsWith("audio/") ||
  extensionOf(file.name) in AUDIO_MIME_BY_EXTENSION;

// Gives a file without a type the one its extension implies.
export function withAudioType(file: File): File {
  if (file.type) return file;
  const type = AUDIO_MIME_BY_EXTENSION[extensionOf(file.name)];
  return type ? new File([file], file.name, { type }) : file;
}

export const canPlayInBrowser = (file: File) =>
  document.createElement("audio").canPlayType(file.type) !== "";
