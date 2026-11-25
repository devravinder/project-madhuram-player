import { useSync } from "@/context/SyncContext";
import db from "@/services/db";
import { formatBytes } from "@/services/storageUsage";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const askedKey = (owner: string) => `madhuram.newDevicePrompt.${owner}`;

const wasAsked = (owner: string) => {
  try {
    return localStorage.getItem(askedKey(owner)) === "1";
  } catch {
    return false;
  }
};

const markAsked = (owner: string) => {
  try {
    localStorage.setItem(askedKey(owner), "1");
  } catch {
    // Storage can be blocked; then it may ask again next time.
  }
};

// On a device that has never synced, offers once to bring the user's
// music from GitHub, or to browse it in Explore and pick.
export default function NewDevicePrompt() {
  const { signedIn, owner, libraries, loadLibraries, sync } = useSync();
  const checked = useRef(false);
  const shown = useRef(false);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    if (!signedIn || !owner || checked.current || wasAsked(owner)) return;
    checked.current = true;
    void (async () => {
      if ((await db.syncState.count()) > 0) {
        markAsked(owner); // this device has synced before
        return;
      }
      setIsNew(true);
      await loadLibraries();
    })();
  }, [signedIn, owner, loadLibraries]);

  useEffect(() => {
    if (!isNew || !libraries || !owner || shown.current) return;
    shown.current = true;
    markAsked(owner);

    const songs = libraries.reduce((sum, library) => sum + library.tracks, 0);
    if (songs === 0) return;
    const bytes = libraries.reduce(
      (sum, library) => sum + library.usedBytes,
      0,
    );
    toast(`You have ${songs} ${songs === 1 ? "song" : "songs"} on GitHub`, {
      description: `${formatBytes(bytes)}. Download all to this device, or browse in Explore and pick.`,
      duration: Infinity,
      action: {
        label: "Download all",
        onClick: () => {
          void sync("download");
          toast("Downloading. Progress is in Settings.");
        },
      },
      cancel: {
        label: "Browse",
        onClick: () => {
          window.location.hash = "#/explore";
        },
      },
    });
  }, [isNew, libraries, owner, sync]);

  return null;
}
