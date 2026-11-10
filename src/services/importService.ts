import { UNKNOWN } from "@/constants";
import type { MediaKind, Song } from "@/types/music";
import { parseBlob, type IPicture } from "music-metadata";
import { saveFile } from "./filesService";
import { withMediaType } from "./mediaTypes";
import { addSong } from "./songsService";
import { readVideoInfo } from "./videoInfo";

function pictureToFile(picture: IPicture) {
  const blob = new Blob([picture.data as unknown as ArrayBuffer], {
    type: picture.format,
  });
  const ext = picture.format.split("/")[1]; // jpeg / png
  return new File([blob], `cover.${ext}`, { type: picture.format });
}

// Tags are optional; a file with unreadable tags still imports.
async function readTags(file: File) {
  try {
    return await parseBlob(file);
  } catch {
    return undefined;
  }
}

const titleFrom = (file: File) =>
  file.name.replace(/\.[^/.]+$/, "") || "uploaded";

async function readDetails(file: File, kind: MediaKind) {
  if (kind === "video") {
    const { duration, poster } = await readVideoInfo(file);
    return { title: titleFrom(file), artist: UNKNOWN, album: UNKNOWN, duration, cover: poster };
  }

  const tags = await readTags(file);
  const picture = tags?.common.picture?.[0];
  return {
    title: tags?.common.title || titleFrom(file),
    artist: tags?.common.artist || UNKNOWN,
    album: tags?.common.album || UNKNOWN,
    duration: tags?.format.duration || 0,
    cover: picture ? pictureToFile(picture) : undefined,
  };
}

export async function importMediaFile(
  original: File,
  kind: MediaKind,
): Promise<Song> {
  const file = withMediaType(original);
  const media = await saveFile(file);
  const details = await readDetails(file, kind);
  const cover = details.cover ? await saveFile(details.cover) : undefined;

  return addSong({
    title: details.title,
    artist: details.artist,
    album: details.album,
    duration: Math.floor(details.duration),
    kind,
    mediaId: media.id,
    mime: file.type,
    bytes: file.size,
    coverImageId: cover?.id,
    addedAt: new Date(),
  });
}
