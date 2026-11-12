import { LibraryRepo } from "./library";

// Public or private applies to a whole library: its main repo and every
// overflow repo, so listeners can always reach every part of every song.
// The main repo goes last when sharing and first when unsharing, so the
// song list is never public while parts are still private.
export async function setLibraryPrivate(library: LibraryRepo, isPrivate: boolean) {
  const { index } = await library.read();
  const overflow = index.repos.map((repo) => repo.name).filter((name) => name !== library.repo);
  const order = isPrivate ? [library.repo, ...overflow] : [...overflow, library.repo];
  for (const name of order) {
    await library.api.setRepoPrivate(library.owner, name, isPrivate);
  }
}

export async function isLibraryPrivate(library: LibraryRepo): Promise<boolean> {
  return (await library.api.getRepo(library.owner, library.repo))?.private ?? true;
}
