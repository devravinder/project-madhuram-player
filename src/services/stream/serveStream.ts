import { decodeStream, parseRange, planPiece, STREAM_PATH } from "./streamPlan";

export const isStreamUrl = (url: URL, origin: string) =>
  url.origin === origin && url.pathname.endsWith(`/${STREAM_PATH}`);

// Answers one byte-range request of the player with a piece of one part.
// Runs in the service worker; `fetchFn` is the network.
export async function serveStream(
  request: Request,
  url: URL,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const description = decodeStream(url.searchParams.get("d"), url.origin);
  if (!description) return new Response("Bad stream", { status: 400 });

  const range = parseRange(request.headers.get("range"), description.size);
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${description.size}` },
    });
  }

  const piece = planPiece(description, range.start, range.end);
  let upstream: Response;
  try {
    upstream = await fetchFn(description.parts[piece.part].url, {
      headers: { Range: `bytes=${piece.from}-${piece.to}` },
    });
  } catch {
    return new Response(null, { status: 504 }); // offline
  }
  if (upstream.status !== 206 && upstream.status !== 200) {
    return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
  }

  // A server that ignores ranges sends the whole part; cut it here.
  const body =
    upstream.status === 206
      ? upstream.body
      : (await upstream.blob()).slice(piece.from, piece.to + 1);

  return new Response(body, {
    status: 206,
    headers: {
      "Content-Type": description.mime,
      "Content-Length": String(piece.end - piece.start + 1),
      "Content-Range": `bytes ${piece.start}-${piece.end}/${description.size}`,
      "Accept-Ranges": "bytes",
    },
  });
}
