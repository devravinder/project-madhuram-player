export const makeFile = (
  name: string,
  content: string | Uint8Array,
  type = "audio/mpeg",
) => new File([content as BlobPart], name, { type });

export const readText = (blob: Blob) => blob.text();

export const randomBytes = (size: number, seed = 1) => {
  const bytes = new Uint8Array(size);
  let state = seed;
  for (let i = 0; i < size; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    bytes[i] = state >>> 24;
  }
  return bytes;
};
