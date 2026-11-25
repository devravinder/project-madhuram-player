import db from "@/services/db";
import type { LibraryRepo } from "@/services/github/library";
import { removeLibrary, type HomeInfo } from "@/services/github/session";

export class LastLibraryError extends Error {
  constructor() {
    super("Keep at least one library.");
  }
}

// Forgets on this device what was synced with a library: its songs stay
// here and show as not backed up, and its queued steps are dropped.
export async function forgetLibrary(name: string) {
  await db.syncState.filter((record) => record.library === name).delete();
  await db.outbox.filter((item) => item.library === name).delete();
}

// Another device deleted these libraries; drop what this device kept of them.
export async function forgetLibrariesExcept(kept: string[]) {
  if (kept.length === 0) return; // never wipe everything on a bad read
  const keep = new Set(kept);
  await db.syncState.filter((record) => !keep.has(record.library)).delete();
  await db.outbox.filter((item) => !keep.has(item.library)).delete();
}

export type DeleteLibraryResult = { info: HomeInfo; notDeleted: string[] };

// Takes the library off the home list first, so no device opens (and
// re-creates) it again, then deletes its repos, overflow repos first.
// Repos GitHub refused to delete are returned for the user to remove.
export async function deleteLibrary(
  home: LibraryRepo,
  library: LibraryRepo,
  libraries: string[],
): Promise<DeleteLibraryResult> {
  if (libraries.length <= 1) throw new LastLibraryError();

  const { index } = await library.read();
  const repos = [
    ...index.repos
      .map((repo) => repo.name)
      .filter((name) => name !== library.repo),
    library.repo,
  ];

  const info = await removeLibrary(home, library.repo);
  const notDeleted: string[] = [];
  for (const repo of repos) {
    try {
      await library.api.deleteRepo(library.owner, repo);
    } catch {
      notDeleted.push(repo);
    }
  }
  await forgetLibrary(library.repo);
  return { info, notDeleted };
}
