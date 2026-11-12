import db from "@/services/db";
import type { OutboxItem, OutboxOp } from "@/types/music";
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
import { removeRemoteTrack } from "./remove";
import { uploadTrack, type UploadOptions } from "./upload";

// Sync: brings in tracks and deletes, sends edits of backed-up tracks.
// Download: only brings tracks in. New tracks go up only through uploadTracks.
export type SyncMode = "both" | "download";

const allows = (mode: SyncMode, op: OutboxOp) => mode === "both" || op === "pull";

export type SyncContext = {
  libraries: LibraryRepo[]; // every library of the user, opened
  device: StorageProvider;
  upload?: UploadOptions;
};

export class LibraryNotOpenError extends Error {
  constructor(name: string) {
    super(`Library ${name} is not in your list.`);
  }
}

const libraryOf = (ctx: SyncContext, name: string) => {
  const library = ctx.libraries.find((l) => l.repo === name);
  if (!library) throw new LibraryNotOpenError(name);
  return library;
};

// Works out what differs in each library and queues it; steps already
// queued are not repeated. A track belongs to the library its record names.
export async function queueSync(
  ctx: SyncContext,
  mode: SyncMode = "both",
): Promise<number> {
  const [local, records] = await Promise.all([ctx.device.listTracks(), db.syncState.toArray()]);
  let queued = 0;

  for (const library of ctx.libraries) {
    const { index } = await library.read();
    const mine = records.filter((record) => record.library === library.repo);
    const steps = planSync(local, index.tracks, mine, {
      restoreDeviceRemoved: mode === "download",
      pushNew: false,
    });
    queued += await outbox.enqueue(
      steps
        .filter((step) => allows(mode, step.op))
        .map((step) => ({ ...step, library: library.repo })),
    );
  }
  return queued;
}

async function push(ctx: SyncContext, item: OutboxItem) {
  const meta = await ctx.device.getTrack(item.trackId);
  if (!meta) return; // deleted on this device while waiting

  let files;
  try {
    files = await ctx.device.readTrackFiles(item.trackId);
  } catch (error) {
    if (error instanceof TrackNotFoundError) return;
    throw error;
  }

  const entry = await uploadTrack(libraryOf(ctx, item.library), meta, files, ctx.upload);
  await db.songs.update(item.trackId, { sha256: entry.sha256 });
  await db.syncState.put({ trackId: item.trackId, sha256: entry.sha256, library: item.library });
}

async function pull(ctx: SyncContext, item: OutboxItem) {
  const library = libraryOf(ctx, item.library);
  const { index, head } = await library.read();
  const entry = index.tracks.find((t) => t.id === item.trackId && !t.deleted);
  if (!entry) return; // removed remotely while waiting

  const text = await library.readText(entry.manifest, head);
  if (!text) throw new Error(`Manifest missing for ${entry.title}`);
  const files = await fetchTrackFiles(JSON.parse(text) as Manifest, (part) =>
    library.api.readBlob(library.owner, part.repo, part.sha),
  );

  const { manifest: _manifest, deleted: _deleted, ...meta } = entry;
  await ctx.device.writeTrack(meta, files);
  await db.syncState.put({ trackId: item.trackId, sha256: entry.sha256!, library: library.repo });
}

async function deleteRemote(ctx: SyncContext, item: OutboxItem) {
  await removeRemoteTrack(libraryOf(ctx, item.library), item.trackId);
  await db.syncState.delete(item.trackId);
}

async function deleteLocal(ctx: SyncContext, item: OutboxItem) {
  await ctx.device.removeTrack(item.trackId).catch((error) => {
    if (!(error instanceof TrackNotFoundError)) throw error;
  });
  await db.syncState.delete(item.trackId);
}

export function createHandler(ctx: SyncContext): OutboxHandler {
  return async (item) => {
    switch (item.op) {
      case "push":
        return push(ctx, item);
      case "pull":
        return pull(ctx, item);
      case "delete-remote":
        return deleteRemote(ctx, item);
      case "delete-local":
        return deleteLocal(ctx, item);
    }
  };
}

export async function syncNow(
  ctx: SyncContext,
  options: RunOptions = {},
  mode: SyncMode = "both",
): Promise<RunResult & { queued: number }> {
  await outbox.resetInterrupted();

  let queued: number;
  try {
    queued = await queueSync(ctx, mode);
  } catch (error) {
    // Offline or limited while reading a library: report it, do not throw.
    const stop = stopReasonOf(error);
    if (!stop) throw error;
    return { done: 0, failed: 0, queued: 0, stoppedBy: stop.reason, waitMs: stop.waitMs };
  }

  const result = await outbox.run(createHandler(ctx), {
    ...options,
    filter: (item) => allows(mode, item.op),
  });
  return { ...result, queued };
}

// Uploads just the chosen tracks into one library, so the user picks both
// what goes to GitHub and where.
export async function uploadTracks(
  ctx: SyncContext,
  trackIds: string[],
  library: string,
  options: RunOptions = {},
): Promise<RunResult & { queued: number }> {
  libraryOf(ctx, library); // fail early for a name not in the list
  await outbox.resetInterrupted();
  const chosen = new Set(trackIds);
  const queued = await outbox.enqueue(
    trackIds.map((trackId) => ({ op: "push" as const, trackId, library })),
  );
  const result = await outbox.run(createHandler(ctx), {
    ...options,
    filter: (item) => item.op === "push" && chosen.has(item.trackId),
  });
  return { ...result, queued };
}

// Finishes steps already queued by an earlier sync or upload, without
// planning new ones; used when the app opens or the connection returns.
export async function resumeQueued(
  ctx: SyncContext,
  options: RunOptions = {},
): Promise<RunResult & { queued: number }> {
  await outbox.resetInterrupted();
  const result = await outbox.run(createHandler(ctx), options);
  return { ...result, queued: 0 };
}
