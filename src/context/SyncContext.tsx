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
import {
  resumeQueued,
  syncNow,
  uploadTracks,
  type SyncMode,
} from "@/services/sync/engine";
import {
  deleteEverywhere as deleteTrackEverywhere,
  type DeleteResult,
} from "@/services/sync/deleteTrack";
import {
  outbox,
  stopReasonOf,
  type RunResult,
  type StopReason,
} from "@/services/sync/outbox";
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

// What one run does: a sync in a mode, an upload of chosen tracks, or
// finishing steps already queued (never planning new uploads).
type SyncJob =
  | { kind: "sync"; mode: SyncMode }
  | { kind: "upload"; trackIds: string[] }
  | { kind: "resume" };

// Stops that end by themselves; the job carries on afterwards.
const isPause = (reason: StopReason | undefined) =>
  reason === "offline" || reason === "rate-limit";

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
  upload: (trackIds: string[]) => Promise<void>; // just these tracks
  cancel: () => void;
  retryFailed: () => Promise<void>;
  changeRepoName: (name: string) => boolean;
  signedIn: boolean;
  keptOnGithub: number; // songs removed from this device only
  deleteEverywhere: (trackId: string) => Promise<DeleteResult>;
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
  const syncRef = useRef<(job: SyncJob) => Promise<void>>(undefined);

  const clearResume = useCallback(() => {
    clearTimeout(resumeTimer.current);
    resumeTimer.current = undefined;
    setResumeAt(undefined);
  }, []);

  // Rate limits and retry backoff end on their own; carry on then with
  // the job that was interrupted (what the user asked for, nothing more).
  const scheduleResume = useCallback(
    (result: Pick<RunResult, "stoppedBy" | "waitMs">, job: SyncJob) => {
      const { waitMs, stoppedBy } = result;
      const resumes =
        waitMs !== undefined &&
        waitMs > 0 &&
        waitMs <= MAX_AUTO_RESUME_MS &&
        stoppedBy !== "cancelled" &&
        stoppedBy !== "auth";
      if (!resumes) return;
      setResumeAt(Date.now() + waitMs);
      resumeTimer.current = setTimeout(() => void syncRef.current?.(job), waitMs + 250);
    },
    [],
  );

  const running = useRef(false);
  // The job a rate limit or lost connection stopped, to carry on with later.
  const interrupted = useRef<SyncJob>(undefined);
  const resumedOnOpen = useRef(false);
  const cancelled = useRef(false);
  const opened = useRef<{ key: string; library: LibraryRepo }>(undefined);

  const items = useLiveQuery(() => db.outbox.toArray(), [], [] as OutboxItem[]);
  const playlists = useLiveQuery(() => db.playlists.toArray(), []);
  const sources = useLiveQuery(() => db.followedSources.toArray(), []);
  const waiting = items.filter((item) => item.status !== "failed").length;
  const failedItems = items.filter((item) => item.status === "failed");
  const keptOnGithub = useLiveQuery(
    () => db.syncState.filter((record) => !!record.deviceRemoved).count(),
    [],
    0,
  );

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

  const runJob = useCallback(
    async (job: SyncJob) => {
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
        const ctx = { library, device: deviceProvider };
        const options = { isCancelled: () => cancelled.current };
        const result =
          job.kind === "sync"
            ? await syncNow(ctx, options, job.mode)
            : job.kind === "upload"
              ? await uploadTracks(ctx, job.trackIds, options)
              : await resumeQueued(ctx, options);
        if (job.kind === "sync" && job.mode === "both" && !result.stoppedBy) {
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
        interrupted.current = isPause(result.stoppedBy) ? job : undefined;
        scheduleResume(result, job);
      } catch (problem) {
        // Offline, rate limit or a rejected token can also hit while
        // connecting or syncing playlists; they pause like queued steps do.
        const stop = stopReasonOf(problem);
        if (stop) {
          const paused = { done: 0, failed: 0, stoppedBy: stop.reason, waitMs: stop.waitMs };
          setLast({ at: Date.now(), queued: 0, ...paused });
          interrupted.current = isPause(stop.reason) ? job : undefined;
          scheduleResume(paused, job);
        } else {
          interrupted.current = undefined;
          report(problem);
        }
      } finally {
        running.current = false;
        setPhase("idle");
      }
    },
    [signedIn, getLibrary, report, clearResume, scheduleResume],
  );

  useEffect(() => {
    syncRef.current = runJob;
  }, [runJob]);

  const sync = useCallback(
    (mode: SyncMode = "both") => runJob({ kind: "sync", mode }),
    [runJob],
  );
  const upload = useCallback(
    (trackIds: string[]) => runJob({ kind: "upload", trackIds }),
    [runJob],
  );
  const resume = useCallback(
    () => runJob(interrupted.current ?? { kind: "resume" }),
    [runJob],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
    clearResume();
  }, [clearResume]);

  const retryFailed = useCallback(async () => {
    await outbox.retryFailed();
    await resume();
  }, [resume]);

  const changeRepoName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!isValidRepoName(trimmed)) return false;
    setLibraryRepoName(trimmed);
    setRepoName(trimmed);
    setNameTaken(undefined);
    return true;
  }, []);

  // Deletes on this device, then on GitHub; offline or failed deletes
  // are finished by the next full sync.
  const deleteEverywhere = useCallback(
    async (trackId: string) => {
      const library = signedIn ? await getLibrary().catch(() => undefined) : undefined;
      return deleteTrackEverywhere(trackId, library);
    },
    [signedIn, getLibrary],
  );

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
        // Background work stays quiet when offline or limited; Sync shows it.
        if (!stopReasonOf(problem)) report(problem);
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

  // Waiting steps carry on once the connection is back; nothing new is
  // planned, so no file is uploaded unless the user asked for it.
  useEffect(() => {
    if (!signedIn) return;
    const onOnline = () => void resume();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [signedIn, resume]);

  // Steps the app was closed in the middle of carry on when it opens
  // again. Failed steps wait for "Retry".
  useEffect(() => {
    if (!signedIn || resumedOnOpen.current) return;
    resumedOnOpen.current = true;
    void (async () => {
      const unfinished = await db.outbox
        .where("status")
        .anyOf("pending", "running")
        .count();
      if (unfinished > 0) await syncRef.current?.({ kind: "resume" });
    })();
  }, [signedIn]);

  // Steps cut off while the app was in the background carry on when the
  // user comes back to it.
  useEffect(() => {
    if (!signedIn || last?.stoppedBy !== "offline") return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void resume();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [signedIn, last, resume]);

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
        upload,
        cancel,
        retryFailed,
        changeRepoName,
        signedIn,
        keptOnGithub,
        deleteEverywhere,
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