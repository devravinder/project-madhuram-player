import type { TrackEntry } from "@/services/github/indexTypes";
import type { TrackMeta } from "@/services/storage/types";
import type { OutboxOp, SyncRecord } from "@/types/music";

export type SyncStep = { op: OutboxOp; trackId: string };

export type PlanOptions = {
  // Bring back tracks that were removed from this device only.
  restoreDeviceRemoved?: boolean;
  // Upload tracks that were never backed up. Off for a plain sync, so the
  // user picks which new files go to GitHub.
  pushNew?: boolean;
};

// Decides what to push, pull or delete. The record of the last successful
// sync tells "deleted on one side" apart from "new on the other side".
export function planSync(
  local: TrackMeta[],
  remote: TrackEntry[],
  records: SyncRecord[],
  options: PlanOptions = {},
): SyncStep[] {
  const synced = new Map(records.map((record) => [record.trackId, record.sha256]));
  const deviceRemoved = new Set(
    records.filter((record) => record.deviceRemoved).map((r) => r.trackId),
  );
  const remoteById = new Map(remote.map((entry) => [entry.id, entry]));
  const localIds = new Set(local.map((track) => track.id));
  const steps: SyncStep[] = [];

  for (const track of local) {
    const entry = remoteById.get(track.id);

    if (!entry || entry.deleted) {
      // Known to a past sync, now gone remotely: it was deleted elsewhere.
      if (synced.has(track.id) || entry?.deleted) {
        steps.push({ op: "delete-local", trackId: track.id });
      } else if (options.pushNew ?? true) {
        steps.push({ op: "push", trackId: track.id });
      }
      continue;
    }

    const localSha = track.sha256 ?? synced.get(track.id);
    if (!localSha || localSha === entry.sha256) continue;

    const lastSynced = synced.get(track.id);
    const localChanged = lastSynced !== undefined && lastSynced !== localSha;
    const remoteChanged = lastSynced !== undefined && lastSynced !== entry.sha256;

    if (localChanged && !remoteChanged) steps.push({ op: "push", trackId: track.id });
    else if (remoteChanged && !localChanged) steps.push({ op: "pull", trackId: track.id });
    else {
      // Both changed, or unknown: the newer edit wins.
      const newerHere = track.updatedAt > entry.updatedAt;
      steps.push({ op: newerHere ? "push" : "pull", trackId: track.id });
    }
  }

  for (const entry of remote) {
    if (entry.deleted || localIds.has(entry.id)) continue;
    if (deviceRemoved.has(entry.id)) {
      // Kept on GitHub only: just a download sync brings it back.
      if (options.restoreDeviceRemoved) steps.push({ op: "pull", trackId: entry.id });
      continue;
    }
    // Synced before but missing here: it was deleted on this device.
    steps.push({
      op: synced.has(entry.id) ? "delete-remote" : "pull",
      trackId: entry.id,
    });
  }

  return steps;
}
