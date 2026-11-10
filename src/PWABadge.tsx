import { useRegisterSW } from "virtual:pwa-register/react";

function PWABadge() {
  // check for updates every hour
  const period = 60 * 60 * 1000;

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      if (period <= 0) return;
      if (r?.active?.state === "activated") {
        registerPeriodicSync(period, swUrl, r);
      } else if (r?.installing) {
        r.installing.addEventListener("statechange", (e) => {
          const sw = e.target as ServiceWorker;
          if (sw.state === "activated") registerPeriodicSync(period, swUrl, r);
        });
      }
    },
  });

  function close() {
    setOfflineReady(false);
    setNeedRefresh(false);
  }

  if (!(offlineReady || needRefresh)) return undefined;

  return (
    <div className="fixed inset-0 z-999 flex items-center justify-center bg-black/40">
      <div
        role="alert"
        aria-labelledby="toast-message"
        className="w-[90%] max-w-md rounded-2xl bg-white p-5 shadow-2xl animate-scaleIn"
      >
        <div className="text-center">
          {offlineReady ? (
            <p
              id="toast-message"
              className="text-sm font-medium text-green-600"
            >
              ✅ App ready to work offline
            </p>
          ) : (
            <p id="toast-message" className="text-sm font-medium text-gray-800">
              🚀 New content available. Reload to update.
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-center gap-3">
          {needRefresh && (
            <button
              onClick={() => {
                updateServiceWorker(true)
                close()
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
            >
              Reload
            </button>
          )}

          <button
            onClick={close}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default PWABadge;

/**
 * This function will register a periodic sync check every hour, you can modify the interval as needed.
 */
function registerPeriodicSync(
  period: number,
  swUrl: string,
  r: ServiceWorkerRegistration
) {
  if (period <= 0) return;

  setInterval(async () => {
    if ("onLine" in navigator && !navigator.onLine) return;

    const resp = await fetch(swUrl, {
      cache: "no-store",
      headers: {
        cache: "no-store",
        "cache-control": "no-cache",
      },
    });

    if (resp?.status === 200) await r.update();
  }, period);
}
