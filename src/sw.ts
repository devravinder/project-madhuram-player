/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { isStreamUrl, serveStream } from "./services/stream/serveStream";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0];
};

// The app shell works offline.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();

self.addEventListener("message", (event) => {
  // "Reload" in the update notice.
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
  // The page checks this worker can stream before it relies on it.
  if (event.data?.type === "STREAM_PING")
    event.ports[0]?.postMessage("STREAM_READY");
});

// Split files of public libraries play part by part.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (isStreamUrl(url, self.location.origin))
    event.respondWith(serveStream(event.request, url));
});
