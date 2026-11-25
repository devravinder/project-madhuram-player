import {
  encodeStream,
  STREAM_PATH,
  type StreamDescription,
} from "./streamPlan";

const PING_TIMEOUT_MS = 1000;

let ready: { worker: ServiceWorker; answer: Promise<boolean> } | undefined;

function ping(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), PING_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data === "STREAM_READY");
    };
    worker.postMessage({ type: "STREAM_PING" }, [channel.port2]);
  });
}

// True when the service worker controls this page and can stream. Before
// it does (the first visit, or an older worker), files are downloaded first.
export async function canStream(): Promise<boolean> {
  const worker =
    typeof navigator !== "undefined"
      ? navigator.serviceWorker?.controller
      : null;
  if (!worker) return false;
  if (ready?.worker !== worker) ready = { worker, answer: ping(worker) };
  return ready.answer;
}

// A link the service worker answers, part by part, as the player reads.
export const streamLink = (description: StreamDescription) =>
  `${import.meta.env.BASE_URL}${STREAM_PATH}?d=${encodeStream(description)}`;
