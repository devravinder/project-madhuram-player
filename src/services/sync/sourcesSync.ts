import db from "@/services/db";
import type { SourceEntry } from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";

export type SourcesMerge = {
  upsert: SourceEntry[]; // changes to make on this device
  remote: SourceEntry[]; // what the library should hold
  remoteChanged: boolean;
};

// Per address the latest change wins, whether a follow or an unfollow.
export function mergeSources(
  local: SourceEntry[],
  remote: SourceEntry[],
): SourcesMerge {
  const localBy = new Map(local.map((s) => [s.address, s]));
  const remoteBy = new Map(remote.map((s) => [s.address, s]));
  const result: SourcesMerge = { upsert: [], remote: [], remoteChanged: false };
  const merged = new Map(remoteBy);

  for (const address of new Set([...localBy.keys(), ...remoteBy.keys()])) {
    const mine = localBy.get(address);
    const theirs = remoteBy.get(address);

    if (mine && (!theirs || mine.updatedAt > theirs.updatedAt)) {
      merged.set(address, mine);
      result.remoteChanged = true;
    } else if (theirs && (!mine || theirs.updatedAt > mine.updatedAt)) {
      // An unfollow of something this device does not have changes nothing.
      if (!mine && theirs.removed) continue;
      result.upsert.push(theirs);
    }
  }

  result.remote = [...merged.values()].sort((a, b) =>
    a.address.localeCompare(b.address),
  );
  return result;
}

const toEntry = (source: {
  address: string;
  updatedAt: Date;
  removed?: boolean;
}): SourceEntry => ({
  address: source.address,
  updatedAt: new Date(source.updatedAt).toISOString(),
  ...(source.removed && { removed: true }),
});

export async function syncSources(
  library: LibraryRepo,
): Promise<{ pushed: boolean; pulled: number }> {
  const stored = await db.followedSources.toArray();
  const local = stored.map(toEntry);
  const { index } = await library.read();
  let result = mergeSources(local, index.sources ?? []);

  if (result.remoteChanged) {
    await library.update((current) => {
      result = mergeSources(local, current.sources ?? []);
      if (!result.remoteChanged) return undefined;
      return {
        message: "Update followed libraries",
        index: { ...current, sources: result.remote },
      };
    });
  }

  const upserts = result.upsert.filter((entry) => !entry.removed);
  const removed = new Set(
    result.upsert
      .filter((entry) => entry.removed)
      .map((entry) => entry.address),
  );
  // GitHub now holds every unfollow read above, so this device forgets
  // them, unless one changed while syncing.
  const done = stored.filter((s) => s.removed || removed.has(s.address));
  await db.transaction("rw", db.followedSources, async () => {
    await db.followedSources.bulkPut(
      upserts.map((entry) => ({
        address: entry.address,
        updatedAt: new Date(entry.updatedAt),
      })),
    );
    for (const source of done) {
      const now = await db.followedSources.get(source.address);
      const untouched =
        now &&
        new Date(now.updatedAt).getTime() ===
          new Date(source.updatedAt).getTime();
      if (untouched && (now.removed || removed.has(source.address))) {
        await db.followedSources.delete(source.address);
      }
    }
  });
  return { pushed: result.remoteChanged, pulled: result.upsert.length };
}
