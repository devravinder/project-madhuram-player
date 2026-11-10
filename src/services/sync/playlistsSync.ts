import { RECENT_PLAYLIST_ID } from "@/constants";
import db from "@/services/db";
import {
  PLAYLISTS_PATH,
  parsePlaylists,
  serializePlaylists,
  type PlaylistEntry,
} from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";
import type { Playlist } from "@/types/music";
import { mergePlaylists, type MergeResult } from "./playlistsMerge";

// "Recently played" is different on every device, so it is not shared.
const NOT_SHARED = [RECENT_PLAYLIST_ID];

const toEntry = (playlist: Playlist): PlaylistEntry => ({
  id: playlist.id,
  name: playlist.name,
  description: playlist.description,
  coverUrl: playlist.coverUrl,
  songIds: playlist.songIds,
  createdAt: new Date(playlist.createdAt).toISOString(),
  updatedAt: new Date(playlist.updatedAt).toISOString(),
});

const toPlaylist = (entry: PlaylistEntry): Playlist => ({
  id: entry.id,
  name: entry.name,
  description: entry.description,
  coverUrl: entry.coverUrl,
  songIds: entry.songIds,
  createdAt: new Date(entry.createdAt),
  updatedAt: new Date(entry.updatedAt),
});

async function readLocal() {
  const [playlists, tombstones] = await Promise.all([
    db.playlists.toArray(),
    db.playlistTombstones.toArray(),
  ]);
  return {
    entries: playlists.map(toEntry),
    tombstones: tombstones.map((t) => ({
      id: t.id,
      deletedAt: new Date(t.deletedAt).toISOString(),
    })),
  };
}

async function applyLocal(merge: MergeResult, tombstoneIds: string[]) {
  const gone = new Set(merge.remote.filter((p) => p.deleted).map((p) => p.id));
  await db.transaction("rw", db.playlists, db.playlistTombstones, async () => {
    await db.playlists.bulkPut(merge.upsert.map(toPlaylist));
    await db.playlists.bulkDelete(merge.remove);
    // A tombstone has done its job once the library records the delete.
    await db.playlistTombstones.bulkDelete(tombstoneIds.filter((id) => gone.has(id)));
  });
}

export type PlaylistSyncResult = {
  pushed: boolean;
  pulled: number;
  removed: number;
};

export async function syncPlaylists(library: LibraryRepo): Promise<PlaylistSyncResult> {
  const local = await readLocal();
  const tombstoneIds = local.tombstones.map((t) => t.id);

  const { head } = await library.read();
  const remoteNow = parsePlaylists(await library.readText(PLAYLISTS_PATH, head));
  let result = mergePlaylists(local.entries, remoteNow, local.tombstones, NOT_SHARED);

  if (result.remoteChanged) {
    // Merge again against what is in the library at commit time.
    await library.update(async (_index, state) => {
      const latest = parsePlaylists(await library.readText(PLAYLISTS_PATH, state.head));
      result = mergePlaylists(local.entries, latest, local.tombstones, NOT_SHARED);
      if (!result.remoteChanged) return undefined;
      return {
        message: "Update playlists",
        text: [{ path: PLAYLISTS_PATH, content: serializePlaylists(result.remote) }],
      };
    });
  }

  await applyLocal(result, tombstoneIds);
  return {
    pushed: result.remoteChanged,
    pulled: result.upsert.length,
    removed: result.remove.length,
  };
}