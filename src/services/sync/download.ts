import db from "@/services/db";
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

// Parts of a download nobody finished are dropped after a week.
const KEEP_UNFINISHED_MS = 7 * 24 * 60 * 60 * 1000;

const partKey = (ref: FileRef, n: number) => `${ref.sha256}:${n}`;

const forgetParts = (ref: FileRef) =>
  db.downloadedParts.where("fileSha256").equals(ref.sha256).delete();

export const dropOldDownloadedParts = (now = Date.now()) =>
  db.downloadedParts
    .where("savedAt")
    .below(now - KEEP_UNFINISHED_MS)
    .delete();

// Each part is kept on the device as soon as it arrives, so a download
// stopped by a reload, a restart or a lost connection carries on with
// the parts still missing instead of starting over.
async function fetchFile(
  ref: FileRef,
  readPart: ReadPart,
  onPart?: () => void,
): Promise<File> {
  const parts: Blob[] = [];
  for (const part of [...ref.parts].sort((a, b) => a.n - b.n)) {
    const kept = await db.downloadedParts.get(partKey(ref, part.n));
    let blob = kept && kept.data.size === part.bytes ? kept.data : undefined;
    if (!blob) {
      blob = await readPart(part);
      if (blob.size !== part.bytes) throw new IntegrityError(ref.name);
      // A single-part file needs no keeping: nothing would be saved by it.
      if (ref.parts.length > 1) {
        await db.downloadedParts.put({
          id: partKey(ref, part.n),
          fileSha256: ref.sha256,
          n: part.n,
          data: blob,
          savedAt: Date.now(),
        });
      }
    }
    parts.push(blob);
    onPart?.();
  }

  const file = joinParts(parts, ref.name, ref.mime);
  if (file.size !== ref.bytes || (await sha256Hex(file)) !== ref.sha256) {
    await forgetParts(ref); // a bad part; fetch them all again next time
    throw new IntegrityError(ref.name);
  }
  return file;
}

// Joins the parts and checks size and hash before anything is saved.
// Kept parts are removed once the whole file is back; callers save it.
export async function fetchTrackFiles(
  manifest: Manifest,
  readPart: ReadPart,
  onPart?: () => void,
): Promise<TrackFiles> {
  await dropOldDownloadedParts();
  const media = await fetchFile(manifest.media, readPart, onPart);
  const cover = manifest.cover
    ? await fetchFile(manifest.cover, readPart, onPart)
    : undefined;
  await forgetParts(manifest.media);
  if (manifest.cover) await forgetParts(manifest.cover);
  return { media, cover };
}
