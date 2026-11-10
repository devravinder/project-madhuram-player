import type { PlaylistEntry } from "@/services/github/indexTypes";

export type PlaylistTombstoneEntry = { id: string; deletedAt: string };

export type MergeResult = {
  // Changes to apply on this device.
  upsert: PlaylistEntry[];
  remove: string[];
  // The playlists file as it should be in the library.
  remote: PlaylistEntry[];
  remoteChanged: boolean;
};

// Per playlist, the most recently edited copy wins. A delete is kept as a
// tombstone, and wins unless the playlist was edited after it.
export function mergePlaylists(
  local: PlaylistEntry[],
  remote: PlaylistEntry[],
  tombstones: PlaylistTombstoneEntry[],
  ignore: string[] = [],
): MergeResult {
  const localById = new Map(local.map((p) => [p.id, p]));
  const remoteById = new Map(remote.map((p) => [p.id, p]));
  const tombstoneById = new Map(tombstones.map((t) => [t.id, t]));
  const ids = new Set([...localById.keys(), ...remoteById.keys(), ...tombstoneById.keys()]);
  ignore.forEach((id) => ids.delete(id));

  const result: MergeResult = { upsert: [], remove: [], remote: [], remoteChanged: false };
  const merged = new Map(remote.map((p) => [p.id, p]));

  const pushRemote = (entry: PlaylistEntry) => {
    merged.set(entry.id, entry);
    result.remoteChanged = true;
  };

  for (const id of ids) {
    const mine = localById.get(id);
    const theirs = remoteById.get(id);
    const deletedHere = tombstoneById.get(id);

    if (mine && !theirs) {
      pushRemote(mine);
    } else if (!mine && theirs && !theirs.deleted) {
      if (deletedHere && deletedHere.deletedAt > theirs.updatedAt) {
        pushRemote({ ...theirs, songIds: [], deleted: true, updatedAt: deletedHere.deletedAt });
      } else {
        result.upsert.push(theirs);
      }
    } else if (mine && theirs?.deleted) {
      if (mine.updatedAt > theirs.updatedAt) pushRemote(mine);
      else result.remove.push(id);
    } else if (mine && theirs && !theirs.deleted) {
      if (mine.updatedAt > theirs.updatedAt) pushRemote(mine);
      else if (theirs.updatedAt > mine.updatedAt) result.upsert.push(theirs);
    }
  }

  const ordered = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
  result.remote = ordered;
  return result;
}