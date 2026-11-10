import db from "@/services/db";
import type { SourceEntry } from "@/services/github/indexTypes";
import { LibraryRepo } from "@/services/github/library";

export type SourcesMerge = {
  upsert: SourceEntry[]; // changes to make on this device
  remote: SourceEntry[]; // what the library should hold
  remoteChanged: boolean;
};

// Per address the latest change wins, whether a follow or an unfollow.
export function mergeSources(local: SourceEntry[], remote: SourceEntry[]): SourcesMerge {
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
      result.upsert.push(theirs);
    }
  }

  result.remote = [...merged.values()].sort((a, b) => a.address.localeCompare(b.address));
  return result;
}

const toEntry = (source: { address: string; updatedAt: Date; removed?: boolean }): SourceEntry => ({
  address: source.address,
  updatedAt: new Date(source.updatedAt).toISOString(),
  ...(source.removed && { removed: true }),
});

export async function syncSources(library: LibraryRepo): Promise<{ pushed: boolean; pulled: number }> {
  const local = (await db.followedSources.toArray()).map(toEntry);
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

  await db.followedSources.bulkPut(
    result.upsert.map((entry) => ({
      address: entry.address,
      updatedAt: new Date(entry.updatedAt),
      ...(entry.removed && { removed: true }),
    })),
  );
  return { pushed: result.remoteChanged, pulled: result.upsert.length };
}