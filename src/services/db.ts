import { Dexie, type EntityTable } from "dexie";
import type {
  AppFile,
  OutboxItem,
  Playlist,
  PlaylistTombstone,
  Song,
  SyncRecord,
} from "@/types/music";
import { DB_NAME } from "@/constants";

export const COLLECTIONS = {
  PLAYLIST_COLLECTION: "playlists",
  SONGS_COLLECTION: "songs",
  FILES_COLLECTION: "files",
  OUTBOX_COLLECTION: "outbox",
  SYNC_STATE_COLLECTION: "syncState",
  PLAYLIST_TOMBSTONES_COLLECTION: "playlistTombstones",
} as const;

class AppDB extends Dexie {
  [COLLECTIONS.SONGS_COLLECTION]!: EntityTable<Song, "id">;
  [COLLECTIONS.PLAYLIST_COLLECTION]!: EntityTable<Playlist, "id">;
  [COLLECTIONS.FILES_COLLECTION]!: EntityTable<AppFile, "id">;
  [COLLECTIONS.OUTBOX_COLLECTION]!: EntityTable<OutboxItem, "id">;
  [COLLECTIONS.SYNC_STATE_COLLECTION]!: EntityTable<SyncRecord, "trackId">;
  [COLLECTIONS.PLAYLIST_TOMBSTONES_COLLECTION]!: EntityTable<
    PlaylistTombstone,
    "id"
  >;

  constructor() {
    super(DB_NAME);

    this.version(1).stores({
      [COLLECTIONS.SONGS_COLLECTION]: "id,title,addedAt",
      [COLLECTIONS.PLAYLIST_COLLECTION]: "id,name,createdAt",
    });

    this.version(2)
      .stores({
        [COLLECTIONS.SONGS_COLLECTION]: "id,title,addedAt",
        [COLLECTIONS.PLAYLIST_COLLECTION]: "id,name,createdAt",
      })
      .upgrade(async (tx) => {
        console.log("Upgrading to v2 → clearing old data");

        await Promise.all([
          tx.table(COLLECTIONS.SONGS_COLLECTION).clear(),
          tx.table(COLLECTIONS.PLAYLIST_COLLECTION).clear(),
          tx.table(COLLECTIONS.FILES_COLLECTION).clear(),
        ]);
      });

    this.version(3)
      .stores({
        [COLLECTIONS.SONGS_COLLECTION]: "id,title,addedAt",
        [COLLECTIONS.PLAYLIST_COLLECTION]: "id,name,createdAt, *songIds",
      })
      .upgrade(async () => {
        console.log("Upgrading to v3 ");
      });

    this.version(4)
      .stores({
        [COLLECTIONS.FILES_COLLECTION]: "id",
      })
      .upgrade(async () => {
        console.log("Upgrading to v4 ");
      });
    this.version(5).stores({
      updateInfo: "collectionName",
      backgroundTasks: "id",
    });

    // The cloud sync tables are gone; null drops them.
    this.version(6).stores({ updateInfo: null, backgroundTasks: null });

    // audioId becomes mediaId; every old song is audio.
    this.version(7)
      .stores({ [COLLECTIONS.SONGS_COLLECTION]: "id,title,addedAt,kind" })
      .upgrade(async (tx) => {
        const songs = tx.table(COLLECTIONS.SONGS_COLLECTION);
        const files = tx.table(COLLECTIONS.FILES_COLLECTION);

        for (const old of await songs.toArray()) {
          const { audioId, ...rest } = old;
          const file = await files.get(audioId);
          await songs.put({
            ...rest,
            kind: "audio",
            mediaId: audioId,
            mime: file?.data.type || "audio/mpeg",
            bytes: file?.data.size ?? 0,
          });
        }
      });

    // Queue of sync steps, and what was last synced per track.
    this.version(8).stores({
      [COLLECTIONS.OUTBOX_COLLECTION]: "id,status,createdAt",
      [COLLECTIONS.SYNC_STATE_COLLECTION]: "trackId",
    });

    // Remembers deleted playlists until the library knows about it.
    this.version(9).stores({
      [COLLECTIONS.PLAYLIST_TOMBSTONES_COLLECTION]: "id",
    });
  }
}

const db = new AppDB();

export const clearData = async (reload: boolean = true) => {
  await Dexie.delete(DB_NAME);
  if (reload) window.location.reload(); // recreate with latest version
};

export const clearDataWithPrompt = async (message: string) => {
  const reset = window.confirm(message);

  if (reset) {
    await clearData();
  }
};

//=====
export async function initDB() {
  console.log("initializeDb");
  try {
    await db.open();
  } catch (error: any) {
    console.error("DB upgrade failed:", error);

    if (error?.name === "UpgradeError") {
      await clearDataWithPrompt(
        "Database upgrade failed.\n" +
          "Old data is incompatible.\n\n" +
          "Do you want to reset database?"
      );
    }
  }
}

export default db;
