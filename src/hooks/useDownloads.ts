import { getDownloads, subscribeDownloads } from "@/services/public/downloads";
import { useSyncExternalStore } from "react";

// What Explore is downloading now, kept across pages.
export const useDownloads = () =>
  useSyncExternalStore(subscribeDownloads, getDownloads, getDownloads);
