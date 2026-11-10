import type { FileRef, Manifest } from "@/services/github/indexTypes";
import { sha256Hex } from "@/services/hash";
import type { TrackFiles } from "@/services/storage/types";
import { joinParts } from "./split";

export class IntegrityError extends Error {
  constructor(name: string) {
    super(`${name} did not download correctly. Try again.`);
  }
}

export type ReadPart = (part: FileRef["parts"][number]) => Promise<Blob>;

async function fetchFile(
  ref: FileRef,
  readPart: ReadPart,
  onPart?: () => void,
): Promise<File> {
  const parts: Blob[] = [];
  for (const part of [...ref.parts].sort((a, b) => a.n - b.n)) {
    const blob = await readPart(part);
    if (blob.size !== part.bytes) throw new IntegrityError(ref.name);
    parts.push(blob);
    onPart?.();
  }

  const file = joinParts(parts, ref.name, ref.mime);
  if (file.size !== ref.bytes || (await sha256Hex(file)) !== ref.sha256) {
    throw new IntegrityError(ref.name);
  }
  return file;
}

// Joins the parts and checks size and hash before anything is saved.
export async function fetchTrackFiles(
  manifest: Manifest,
  readPart: ReadPart,
  onPart?: () => void,
): Promise<TrackFiles> {
  const media = await fetchFile(manifest.media, readPart, onPart);
  const cover = manifest.cover
    ? await fetchFile(manifest.cover, readPart, onPart)
    : undefined;
  return { media, cover };
}
