import { authStore } from "@/services/github/authStore";
import { useSyncExternalStore } from "react";

export function useAuth() {
  return useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
}
