// Cuts a file into raw byte parts no larger than `partBytes`.
// An empty file still gets one (empty) part so every file has a part list.
export function splitBlob(blob: Blob, partBytes: number): Blob[] {
  if (partBytes <= 0) throw new Error("Part size must be positive");
  if (blob.size === 0) return [blob];

  const parts: Blob[] = [];
  for (let start = 0; start < blob.size; start += partBytes) {
    parts.push(blob.slice(start, start + partBytes));
  }
  return parts;
}

export function joinParts(parts: Blob[], name: string, type: string): File {
  return new File(parts, name, { type });
}

// Two-letter folders keep any one directory small.
export function partPath(
  trackId: string,
  file: "media" | "cover",
  n: number,
): string {
  return `data/${trackId.slice(0, 2)}/${trackId}/${file}.${n}`;
}

export const manifestPath = (trackId: string) => `manifests/${trackId}.json`;
