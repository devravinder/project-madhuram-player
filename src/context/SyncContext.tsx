import { config } from "@/config";
import { useAuth } from "@/hooks/useAuth";
import db from "@/services/db";
import { UnsupportedIndexVersionError } from "@/services/github/indexTypes";
import type { LibraryRepo } from "@/services/github/library";
import { LibraryNameTakenError, openLibrary } from "@/services/github/session";
import { HttpError } from "@/services/httpError";
import {
  getLibraryRepoName,
  isValidRepoName,
  setLibraryRepoName,
} from "@/services/settingsStore";
import { deviceProvider } from "@/services/storage/deviceProvider";
import { syncNow, type SyncMode } from "@/services/sync/engine";
import { outbox, type StopReason } from "@/services/sync/outbox";
import { syncPlaylists } from "@/services/sync/playlistsSync";
import { syncSources } from "@/services/sync/sourcesSync";
import type { OutboxItem } from "@/types/music";
import { useLiveQuery } from "dexie-react-hooks";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Playlist edits are bundled together before they are sent.
const PLAYLIST_SYNC_DELAY_MS = 3000;

export type SyncPhase = "idle" | "connecting" | "syncing";

export type LastRun = {
  at: number;
  queued: number;
  done: number;
  failed: number;
  stoppedBy?: StopReason;
};

type SyncContextValue = {
  phase: SyncPhase;
  error?: string;
  nameTaken?: string;
  last?: LastRun;
  repoName: string;
  waiting: number;
  failedItems: OutboxItem[];
  sync: (mode?: SyncMode) => Promise<void>;
  cancel: () => void;
  retryFailed: () => Promise<void>;
  changeRepoName: (name: string) => boolean;
};

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

function describe(error: unknown): string {
  if (error instanceof UnsupportedIndexVersionError) return error.message;
  if (error instanceof HttpError && error.status === 401) {
    return "GitHub rejected the token. Remove it in Settings and sign in again.";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong while syncing.";
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { status, token, user } = useAuth();
  const signedIn = status === "signed-in" && !!token && !!user;

  const [phase, setPhase] = useState<SyncPhase>("idle");
  const [error, setError] = useState<string>();
  const [nameTaken, setNameTaken] = useState<string>();
  const [last, setLast] = useState<LastRun>();
  const [repoName, setRepoName] = useState(getLibraryRepoName);

  const running = useRef(false);
  const cancelled = useRef(false);
  const opened = useRef<{ key: string; library: LibraryRepo }>(undefined);

  const items = useLiveQuery(() => db.outbox.toArray(), [], [] as OutboxItem[]);
  const playlists = useLiveQuery(() => db.playlists.toArray(), []);
  const sources = useLiveQuery(() => db.followedSources.toArray(), []);
  const waiting = items.filter((item) => item.status !== "failed").length;
  const failedItems = items.filter((item) => item.status === "failed");

  const report = useCallback((problem: unknown) => {
    if (problem instanceof LibraryNameTakenError) setNameTaken(problem.repo);
    else setError(describe(problem));
  }, []);

  const getLibrary = useCallback(async () => {
    if (!token || !user) throw new Error("Sign in first.");
    const key = `${token}:${user.login}/${repoName}`;
    if (opened.current?.key === key) return opened.current.library;

    const { library } = await openLibrary({
      token,
      login: user.login,
      repoName,
      config: {
        maxFileBytes: config.maxFileBytes,
        maxRepoBytes: config.maxRepoBytes,
      },
    });
    opened.current = { key, library };
    return library;
  }, [token, user, repoName]);

  const sync = useCallback(
    async (mode: SyncMode = "both") => {
      if (!signedIn || running.current) return;
      running.current = true;
      cancelled.current = false;
      setError(undefined);
      setNameTaken(undefined);
      setPhase("connecting");

      try {
        const library = await getLibrary();
        setPhase("syncing");
        const result = await syncNow(
          { library, device: deviceProvider },
          { isCancelled: () => cancelled.current },
          mode,
        );
        if (mode === "both" && !result.stoppedBy) {
          await syncPlaylists(library);
          await syncSources(library);
        }
        setLast({
          at: Date.now(),
          queued: result.queued,
          done: result.done,
          failed: result.failed,
          stoppedBy: result.stoppedBy,
        });
      } catch (problem) {
        report(problem);
      } finally {
        running.current = false;
        setPhase("idle");
      }
    },
    [signedIn, getLibrary, report],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);

  const retryFailed = useCallback(async () => {
    await outbox.retryFailed();
    await sync();
  }, [sync]);

  const changeRepoName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!isValidRepoName(trimmed)) return false;
    setLibraryRepoName(trimmed);
    setRepoName(trimmed);
    setNameTaken(undefined);
    return true;
  }, []);

  // Playlists and followed libraries follow the user without asking,
  // a moment after each change.
  useEffect(() => {
    if (!signedIn || playlists === undefined || sources === undefined) return;
    const timer = setTimeout(async () => {
      if (running.current) return;
      try {
        const library = await getLibrary();
        await syncPlaylists(library);
        await syncSources(library);
      } catch (problem) {
        report(problem);
      }
    }, PLAYLIST_SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [signedIn, playlists, sources, getLibrary, report]);

  // Removing the token stops a sync in progress; queued steps stay for later.
  useEffect(() => {
    if (!signedIn) cancelled.current = true;
  }, [signedIn]);

  // Waiting steps carry on once the connection is back.
  useEffect(() => {
    if (!signedIn) return;
    const resume = () => void sync();
    window.addEventListener("online", resume);
    return () => window.removeEventListener("online", resume);
  }, [signedIn, sync]);

  return (
    <SyncContext.Provider
      value={{
        phase,
        error,
        nameTaken,
        last,
        repoName,
        waiting,
        failedItems,
        sync,
        cancel,
        retryFailed,
        changeRepoName,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync must be used within a SyncProvider");
  return context;
}