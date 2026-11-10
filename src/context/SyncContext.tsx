import { config } from "@/config";
import { useAuth } from "@/hooks/useAuth";
import db from "@/services/db";
import {
  UnsupportedIndexVersionError,
  type RepoInfo,
} from "@/services/github/indexTypes";
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
// A long wait is better left to the next manual sync or reconnect.
const MAX_AUTO_RESUME_MS = 15 * 60 * 1000;

export type SyncPhase = "idle" | "connecting" | "syncing";

export type LastRun = {
  at: number;
  queued: number;
  done: number;
  failed: number;
  stoppedBy?: StopReason;
};

export type RepoUsage = { repos: RepoInfo[]; maxRepoBytes: number };

type SyncContextValue = {
  usage?: RepoUsage;
  resumeAt?: number; // when a paused sync carries on by itself
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
  const [usage, setUsage] = useState<RepoUsage>();
  const [resumeAt, setResumeAt] = useState<number>();
  const resumeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const syncRef = useRef<(mode?: SyncMode) => Promise<void>>(undefined);

  const clearResume = useCallback(() => {
    clearTimeout(resumeTimer.current);
    resumeTimer.current = undefined;
    setResumeAt(undefined);
  }, []);

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
      clearResume();
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
        const { index } = result.stoppedBy
          ? { index: undefined }
          : await library.read();
        if (index) {
          setUsage({ repos: index.repos, maxRepoBytes: index.config.maxRepoBytes });
        }
        setLast({
          at: Date.now(),
          queued: result.queued,
          done: result.done,
          failed: result.failed,
          stoppedBy: result.stoppedBy,
        });

        // Rate limits and retry backoff end on their own; carry on then.
        const autoResume =
          result.waitMs !== undefined &&
          result.waitMs > 0 &&
          result.waitMs <= MAX_AUTO_RESUME_MS &&
          result.stoppedBy !== "cancelled" &&
          result.stoppedBy !== "auth";
        if (autoResume) {
          setResumeAt(Date.now() + result.waitMs!);
          resumeTimer.current = setTimeout(
            () => void syncRef.current?.(mode),
            result.waitMs! + 250,
          );
        }
      } catch (problem) {
        report(problem);
        // A rejected token can surface outside the queue too, e.g. on connect.
        if (problem instanceof HttpError && problem.status === 401) {
          setLast({ at: Date.now(), queued: 0, done: 0, failed: 0, stoppedBy: "auth" });
        }
      } finally {
        running.current = false;
        setPhase("idle");
      }
    },
    [signedIn, getLibrary, report, clearResume],
  );

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  const cancel = useCallback(() => {
    cancelled.current = true;
    clearResume();
  }, [clearResume]);

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
    if (signedIn) return;
    cancelled.current = true;
    clearTimeout(resumeTimer.current);
  }, [signedIn]);

  useEffect(() => () => clearTimeout(resumeTimer.current), []);

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
        usage,
        resumeAt,
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