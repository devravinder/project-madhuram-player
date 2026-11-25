import { MAX_DISPLAY_NAME } from "./indexTypes";
import type { LibraryRepo } from "./library";

export class InvalidDisplayNameError extends Error {
  constructor() {
    super(`Use up to ${MAX_DISPLAY_NAME} characters.`);
  }
}

// Gives a library a name of the user's choice. The repo keeps its name, so
// links, followers and sync are not affected. An empty name, or the repo's
// own name, clears it.
export async function setDisplayName(library: LibraryRepo, raw: string) {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length > MAX_DISPLAY_NAME) throw new InvalidDisplayNameError();
  const displayName = name && name !== library.repo ? name : undefined;

  const index = await library.update((current) => {
    if (current.displayName === displayName) return undefined;
    const { displayName: _old, ...rest } = current;
    return {
      message: displayName
        ? `Name library ${displayName}`
        : "Clear library name",
      index: displayName ? { ...rest, displayName } : rest,
    };
  });
  return index.displayName;
}
