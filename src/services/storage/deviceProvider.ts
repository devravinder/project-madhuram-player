import db from "@/services/db";
import { deleteFile, getFile, saveFile } from "@/services/filesService";
import { deleteSong, getSong, getSongs } from "@/services/songsService";
import type { Song } from "@/types/music";
import {
  TrackNotFoundError,
  type StorageProvider,
  type TrackFiles,
  type TrackMeta,
} from "./types";

const toMeta = (song: Song): TrackMeta => ({
  id: song.id,
  kind: song.kind,
  title: song.title,
  artist: song.artist,
  album: song.album,
  duration: song.duration,
  mime: song.mime,
  bytes: song.bytes,
  sha256: song.sha256,
  addedAt: new Date(song.addedAt).toISOString(),
  updatedAt: new Date(song.updatedAt ?? song.addedAt).toISOString(),
});

// Stored files keep the name they had, so a later upload keeps its extension.
const asFile = (record: { id: string; data: File } | undefined, id: string) => {
  if (!record) throw new TrackNotFoundError(id);
  return record.data;
};

export const deviceProvider: StorageProvider = {
  id: "device",
  label: "This device",
  writable: true,

  async listTracks() {
    return (await getSongs()).map(toMeta);
  },

  async getTrack(id) {
    const song = await getSong(id);
    return song && toMeta(song);
  },

  async readTrackFiles(id) {
    const song = await getSong(id);
    if (!song) throw new TrackNotFoundError(id);

    const media = asFile(await getFile(song.mediaId), id);
    const coverRecord = song.coverImageId
      ? await getFile(song.coverImageId)
      : undefined;
    return { media, cover: coverRecord?.data };
  },

  async writeTrack(meta: TrackMeta, files: TrackFiles) {
    const existing = await getSong(meta.id);
    if (existing) {
      await deleteFile(existing.mediaId);
      if (existing.coverImageId) await deleteFile(existing.coverImageId);
    }

    const media = await saveFile(files.media);
    const cover = files.cover ? await saveFile(files.cover) : undefined;

    await db.songs.put({
      id: meta.id,
      kind: meta.kind,
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      duration: meta.duration,
      mime: meta.mime,
      bytes: meta.bytes,
      sha256: meta.sha256,
      addedAt: new Date(meta.addedAt),
      updatedAt: new Date(meta.updatedAt),
      mediaId: media.id,
      coverImageId: cover?.id,
    });
  },

  async removeTrack(id) {
    await deleteSong(id);
  },
};
