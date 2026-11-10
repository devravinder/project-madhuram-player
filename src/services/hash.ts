const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(data: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await data.arrayBuffer());
  return toHex(new Uint8Array(digest));
}

// Same value `git hash-object` gives, so a local file can be compared
// with a repo blob without downloading it.
export async function gitBlobSha(data: Blob): Promise<string> {
  const header = new TextEncoder().encode(`blob ${data.size}\0`);
  const body = new Uint8Array(await data.arrayBuffer());
  const joined = new Uint8Array(header.length + body.length);
  joined.set(header);
  joined.set(body, header.length);
  const digest = await crypto.subtle.digest("SHA-1", joined);
  return toHex(new Uint8Array(digest));
}
