// Plays a file kept as several parts without downloading it first: the
// service worker answers the player's byte-range requests with just the
// piece of the part that holds those bytes.

export type StreamPart = { url: string; bytes: number };
export type StreamDescription = {
  mime: string;
  size: number;
  parts: StreamPart[];
};

export const STREAM_PATH = "__stream";
// The most one answer carries; the player asks again for the rest.
export const MAX_PIECE_BYTES = 4 * 1024 * 1024;

const toBase64Url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return new TextDecoder().decode(
    Uint8Array.from(binary, (c) => c.charCodeAt(0)),
  );
};

export const encodeStream = (description: StreamDescription) =>
  toBase64Url(JSON.stringify(description));

// Parts come from GitHub over https, or from the app's own origin.
export function decodeStream(
  value: string | null,
  origin?: string,
): StreamDescription | undefined {
  if (!value) return undefined;
  const allowed = (url: string) =>
    url.startsWith("https://") || (!!origin && url.startsWith(`${origin}/`));
  try {
    const data = JSON.parse(fromBase64Url(value)) as StreamDescription;
    const valid =
      typeof data.mime === "string" &&
      Array.isArray(data.parts) &&
      data.parts.length > 0 &&
      data.parts.every(
        (p) => typeof p.url === "string" && allowed(p.url) && p.bytes > 0,
      ) &&
      data.size === data.parts.reduce((sum, p) => sum + p.bytes, 0);
    return valid ? data : undefined;
  } catch {
    return undefined;
  }
}

// "bytes=a-b", "bytes=a-" or "bytes=-n" (the last n bytes). No header means
// from the start. Undefined when the range cannot be served.
export function parseRange(header: string | null, size: number) {
  if (!header) return { start: 0, end: size - 1 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return undefined;
  let start: number;
  let end: number;
  if (match[1] === "") {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return undefined;
  return { start, end };
}

export type Piece = {
  part: number; // which part to read
  from: number; // first byte within that part
  to: number; // last byte within that part
  start: number; // first byte within the whole file
  end: number; // last byte within the whole file
};

// The piece of one part that begins at `start`, cut at the part's end,
// the requested end and the piece limit.
export function planPiece(
  description: StreamDescription,
  start: number,
  end: number,
  maxBytes = MAX_PIECE_BYTES,
): Piece {
  let offset = 0;
  for (const [part, { bytes }] of description.parts.entries()) {
    if (start < offset + bytes) {
      const partEnd = offset + bytes - 1;
      const last = Math.min(end, partEnd, start + maxBytes - 1);
      return {
        part,
        from: start - offset,
        to: last - offset,
        start,
        end: last,
      };
    }
    offset += bytes;
  }
  throw new RangeError("Start is past the end of the file");
}
