import { PublicLibraryError } from "@/services/public/publicLibrary";
import { loadRemoteLibrary } from "@/services/public/remote";
import { useQuery } from "@tanstack/react-query";

export const publicKeys = {
  all: ["public"] as const,
  index: (owner: string, repo: string) =>
    ["public", "index", owner, repo] as const,
};

// Asks GitHub again each time the page opens, so removed tracks disappear.
// The user's own libraries are read with the token, so private ones open too.
export function usePublicTracks(owner: string, repo: string) {
  return useQuery({
    queryKey: publicKeys.index(owner, repo),
    queryFn: () => loadRemoteLibrary(owner, repo),
    // A missing or foreign library will not appear by retrying.
    retry: (count, error) =>
      !(error instanceof PublicLibraryError) && count < 2,
  });
}
