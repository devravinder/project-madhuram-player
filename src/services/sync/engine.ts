import db from "@/services/db";
import type { Manifest } from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";
import {
  TrackNotFoundError,
  type StorageProvider,
} from "@/services/storage/types";
import { fetchTrackFiles } from "./download";
import {
  outbox,
  stopReasonOf,
  type OutboxHandler,
  type RunOptions,
  type RunResult,
} from "./outbox";
import { planSync } from "./planner";
import { uploadTrack, type UploadOptions } from "./upload";

export type SyncContext = {
  library: LibraryRepo;
  device: StorageProvider;
  upload?: UploadOptions;
};

// Works out what differs and queues it; steps already queued are not repeated.
export async function queueSync(ctx: SyncContext): Promise<number> {
  const [{ index }, local, records] = await Promise.all([
    ctx.library.read(),
    ctx.device.listTracks(),
    db.syncState.toArray(),
  ]);
  return outbox.enqueue(planSync(local, index.tracks, records));
}

async function push(ctx: SyncContext, trackId: string) {
  const meta = await ctx.device.getTrack(trackId);
  if (!meta) return; // deleted on this device while waiting

  let files;
  try {
    files = await ctx.device.readTrackFiles(trackId);
  } catch (error) {
    if (error instanceof TrackNotFoundError) return;
    throw error;
  }

  const entry = await uploadTrack(ctx.library, meta, files, ctx.upload);
  await db.songs.update(trackId, { sha256: entry.sha256 });
  await db.syncState.put({ trackId, sha256: entry.sha256 });
}

async function pull(ctx: SyncContext, trackId: string) {
  const { library } = ctx;
  const { index, head } = await library.read();
  const entry = index.tracks.find((t) => t.id === trackId && !t.deleted);
  if (!entry) return; // removed remotely while waiting

  const text = await library.readText(entry.manifest, head);
  if (!text) throw new Error(`Manifest missing for ${entry.title}`);
  const files = await fetchTrackFiles(JSON.parse(text) as Manifest, (part) =>
    library.api.readBlob(library.owner, part.repo, part.sha),
  );

  const { manifest: _manifest, deleted: _deleted, ...meta } = entry;
  await ctx.device.writeTrack(meta, files);
  await db.syncState.put({ trackId, sha256: entry.sha256! });
}

async function deleteRemote(ctx: SyncContext, trackId: string) {
  await ctx.library.update((index) => {
    const entry = index.tracks.find((t) => t.id === trackId);
    if (!entry || entry.deleted) return { message: "No change", index };
    return {
      message: `Remove ${entry.title}`,
      index: {
        ...index,
        tracks: index.tracks.map((t) =>
          t.id === trackId
            ? { ...t, deleted: true, updatedAt: new Date().toISOString() }
            : t,
        ),
      },
    };
  });
  await db.syncState.delete(trackId);
}

async function deleteLocal(ctx: SyncContext, trackId: string) {
  await ctx.device.removeTrack(trackId).catch((error) => {
    if (!(error instanceof TrackNotFoundError)) throw error;
  });
  await db.syncState.delete(trackId);
}

export function createHandler(ctx: SyncContext): OutboxHandler {
  return async (item) => {
    switch (item.op) {
      case "push":
        return push(ctx, item.trackId);
      case "pull":
        return pull(ctx, item.trackId);
      case "delete-remote":
        return deleteRemote(ctx, item.trackId);
      case "delete-local":
        return deleteLocal(ctx, item.trackId);
    }
  };
}

export async function syncNow(
  ctx: SyncContext,
  options: RunOptions = {},
): Promise<RunResult & { queued: number }> {
  await outbox.resetInterrupted();

  let queued: number;
  try {
    queued = await queueSync(ctx);
  } catch (error) {
    // Offline or limited while reading the library: report it, do not throw.
    const stop = stopReasonOf(error);
    if (!stop) throw error;
    return { done: 0, failed: 0, queued: 0, stoppedBy: stop.reason, waitMs: stop.waitMs };
  }

  const result = await outbox.run(createHandler(ctx), options);
  return { ...result, queued };
}
