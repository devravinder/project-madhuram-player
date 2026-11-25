import { getFile } from "@/services/filesService";
import type { Song } from "@/types/music";

const EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/webm": "webm",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
};

// The song's title with the file's own extension. The file is saved as it
// was imported; nothing is converted.
export function downloadName(
  song: Pick<Song, "title" | "kind">,
  file: File,
): string {
  const fromName = /\.([A-Za-z0-9]{1,5})$/.exec(file.name)?.[1];
  const extension = (
    fromName ??
    EXTENSIONS[file.type] ??
    (song.kind === "video" ? "mp4" : "mp3")
  ).toLowerCase();
  // Characters that file systems refuse, including control characters.
  const refused = new RegExp(
    `[\\\\/:*?"<>|${String.fromCharCode(0)}-${String.fromCharCode(31)}]+`,
    "g",
  );
  const safe = song.title.replace(refused, " ").replace(/\s+/g, " ").trim();
  return `${safe || "song"}.${extension}`;
}

export class FileNotOnDeviceError extends Error {
  constructor() {
    super("The file is not on this device.");
  }
}

// Saves the song's file to the device's Downloads, like any web download.
export async function saveToDisk(song: Song): Promise<string> {
  const record = await getFile(song.mediaId);
  if (!record) throw new FileNotOnDeviceError();

  const name = downloadName(song, record.data);
  const url = URL.createObjectURL(record.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start reading it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return name;
}
