import { config } from "@/config";
import { useAuth } from "@/hooks/useAuth";
import db from "@/services/db";
import { GithubApi } from "@/services/github/api";
import {
  UnsupportedIndexVersionError,
  type RepoInfo,
} from "@/services/github/indexTypes";
import type { LibraryRepo } from "@/services/github/library";
import {
  homeInfo,
  LibraryNameTakenError,
  openHome,
  openLibrary,
  saveLibrary,
  setDefaultLibrary as saveDefaultLibrary,
  type HomeInfo,
} from "@/services/github/session";
import { isLibraryPrivate, setLibraryPrivate } from "@/services/github/visibility";
import { HttpError } from "@/services/httpError";
import { isValidRepoName } from "@/services/settingsStore";
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

const LIBRARY_CONFIG = {
  maxFileBytes: config.maxFileBytes,
  maxRepoBytes: config.maxRepoBytes,
};

export type SyncPhase = "idle" | "connecting" | "syncing";

export type LastRun = {
  at: number;
  queued: number;
  done: number;
  failed: number;
  stoppedBy?: StopReason;
};

export type RepoUsage = { repos: RepoInfo[]; maxRepoBytes: number };

// One of the user's libraries, as shown in Settings.
export type LibraryInfo = {
  name: string;
  isPrivate: boolean;
  isDefault: boolean;
  tracks: number;
  usedBytes: number;
  repos: RepoInfo[];
};

// What one run does: a sync in a mode, an upload of chosen tracks into a
// library, or finishing steps already queued (never planning new uploads).
type SyncJob =
  | { kind: "sync"; mode: SyncMode }
  | { kind: "upload"; trackIds: string[]; library: string }
  | { kind: "resume" };

// Stops that end by themselves; the job carries on afterwards.
const isPause = (reason: StopReason | undefined) =>
  reason === "offline" || reason === "rate-limit";

// The opened home and libraries, kept for the signed-in account.
type Session = {
  key: string;
  home: LibraryRepo;
  info: HomeInfo;
  libraries: LibraryRepo[];
};

type SyncContextValue = {
  usage?: RepoUsage;
  resumeAt?: number; // when a paused sync carries on by itself
  phase: SyncPhase;
  error?: string;
  nameTaken?: string; // a library name that belongs to another repo
  last?: LastRun;
  waiting: number;
  failedItems: OutboxItem[];
  libraries?: LibraryInfo[]; // known once connected
  defaultLibrary?: string;
  changingLibrary?: string; // a library whose visibility is being changed
  sync: (mode?: SyncMode) => Promise<void>;
  upload: (trackIds: string[], library: string) => Promise<void>;
  cancel: () => void;
  retryFailed: () => Promise<void>;
  loadLibraries: () => Promise<void>;
  addLibrary: (name: string) => Promise<string | undefined>; // an error, if any
  replaceTakenLibrary: (name: string) => Promise<string | undefined>;
  setDefaultLibrary: (name: string) => Promise<void>;
  setLibraryVisibility: (name: string, isPrivate: boolean) => Promise<void>;
  signedIn: boolean;
  owner?: string;
  keptOnGithub: number; // songs removed from this device only
  deleteEverywhere: (trackId: string) => Promise<DeleteResult>;
};

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

function describe(error: unknown): string {
  if (error instanceof UnsupportedIndexVersionError) return error.message;
  if (error instanceof HttpError && error.status === 401) {
    return "Token rejected. Remove it in Settings and sign in again.";
  }
  if (error instanceof HttpError && error.status === 403) {
    return "The token is not allowed to do this. It needs Administration (read and write).";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { status, token, user } = useAuth();
  const signedIn = status === "signed-in" && !!token && !!user;

  const [phase, setPhase] = useState<SyncPhase>("idle");
  const [error, setError] = useState<string>();
  const [nameTaken, setNameTaken] = useState<string>();
  const [last, setLast] = useState<LastRun>();
  const [libraries, setLibraries] = useState<LibraryInfo[]>();
  const [changingLibrary, setChangingLibrary] = useState<string>();
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
  const session = useRef<Session>(undefined);

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

  const sessionOptions = useCallback(() => {
    if (!token || !user) throw new Error("Sign in first.");
    return { api: new GithubApi(token), login: user.login, config: LIBRARY_CONFIG };
  }, [token, user]);

  // Opens the home repo and every library listed in it, creating the first
  // ones for a new account. A library whose name turns out to be taken is
  // left out and reported, so the user can pick another name.
  const openSession = useCallback(async (): Promise<Session> => {
    if (!token || !user) throw new Error("Sign in first.");
    const key = `${token}:${user.login}`;
    if (session.current?.key === key) return session.current;

    const options = sessionOptions();
    const home = await openHome(options, config.homeRepoName, config.libraryRepoName);
    const info = homeInfo((await home.read()).index);
    const opened: LibraryRepo[] = [];
    for (const name of info.libraries) {
      try {
        opened.push(await openLibrary(options, name));
      } catch (problem) {
        if (!(problem instanceof LibraryNameTakenError)) throw problem;
        setNameTaken(problem.repo);
      }
    }
    session.current = { key, home, info, libraries: opened };
    return session.current;
  }, [token, user, sessionOptions]);

  const refreshLibraries = useCallback(async (current: Session) => {
    const infos = await Promise.all(
      current.libraries.map(async (library): Promise<LibraryInfo> => {
        const [{ index }, isPrivate] = await Promise.all([
          library.read(),
          isLibraryPrivate(library),
        ]);
        return {
          name: library.repo,
          isPrivate,
          isDefault: library.repo === current.info.defaultLibrary,
          tracks: index.tracks.filter((t) => !t.deleted).length,
          usedBytes: index.repos.reduce((sum, repo) => sum + repo.usedBytes, 0),
          repos: index.repos,
        };
      }),
    );
    setLibraries(infos);
  }, []);

  const runJob = useCallback(
    async (job: SyncJob) => {
      if (!signedIn || running.current) return;
      clearResume();
      running.current = true;
      cancelled.current = false;
      setError(undefined);
      setPhase("connecting");

      try {
        const current = await openSession();
        setPhase("syncing");
        const ctx = { libraries: current.libraries, device: deviceProvider };
        const options = { isCancelled: () => cancelled.current };
        const result =
          job.kind === "sync"
            ? await syncNow(ctx, options, job.mode)
            : job.kind === "upload"
              ? await uploadTracks(ctx, job.trackIds, job.library, options)
              : await resumeQueued(ctx, options);
        if (job.kind === "sync" && job.mode === "both" && !result.stoppedBy) {
          await syncPlaylists(current.home);
          await syncSources(current.home);
        }
        if (!result.stoppedBy) await refreshLibraries(current);
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
    [signedIn, openSession, refreshLibraries, report, clearResume, scheduleResume],
  );

  useEffect(() => {
    syncRef.current = runJob;
  }, [runJob]);

  const sync = useCallback(
    (mode: SyncMode = "both") => runJob({ kind: "sync", mode }),
    [runJob],
  );
  const upload = useCallback(
    (trackIds: string[], library: string) => runJob({ kind: "upload", trackIds, library }),
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

  // Runs a library action and shows its result in the list.
  const withSession = useCallback(
    async (action: (current: Session) => Promise<void>) => {
      if (!signedIn) return;
      setError(undefined);
      try {
        const current = await openSession();
        await action(current);
        await refreshLibraries(current);
      } catch (problem) {
        if (stopReasonOf(problem)?.reason === "offline") setError("Offline.");
        else report(problem);
      }
    },
    [signedIn, openSession, refreshLibraries, report],
  );

  const loadLibraries = useCallback(async () => {
    if (running.current) return;
    await withSession(async () => {});
  }, [withSession]);

  // Creates (or adopts) the repo, then lists it in the home repo.
  const addOrReplace = useCallback(
    async (rawName: string, replacing?: string): Promise<string | undefined> => {
      const name = rawName.trim();
      if (!isValidRepoName(name)) return "Use letters, numbers, dots, dashes or underscores.";
      if (name === config.homeRepoName) return "That name is used for your playlists.";
      if (session.current?.info.libraries.includes(name) && name !== replacing) {
        return "You already have this library.";
      }
      let failure: string | undefined;
      await withSession(async (current) => {
        try {
          const library = await openLibrary(sessionOptions(), name);
          current.info = await saveLibrary(current.home, name, replacing);
          current.libraries = [
            ...current.libraries.filter((l) => l.repo !== replacing && l.repo !== name),
            library,
          ];
          if (replacing) setNameTaken(undefined);
        } catch (problem) {
          if (!(problem instanceof LibraryNameTakenError)) throw problem;
          failure = `${name} already exists and is not a music library. Choose another name.`;
        }
      });
      return failure;
    },
    [withSession, sessionOptions],
  );

  const addLibrary = useCallback((name: string) => addOrReplace(name), [addOrReplace]);
  const replaceTakenLibrary = useCallback(
    (name: string) => addOrReplace(name, nameTaken),
    [addOrReplace, nameTaken],
  );

  const setDefaultLibrary = useCallback(
    (name: string) =>
      withSession(async (current) => {
        current.info = await saveDefaultLibrary(current.home, name);
      }),
    [withSession],
  );

  const setLibraryVisibility = useCallback(
    async (name: string, isPrivate: boolean) => {
      setChangingLibrary(name);
      try {
        await withSession(async (current) => {
          const library = current.libraries.find((l) => l.repo === name);
          if (library) await setLibraryPrivate(library, isPrivate);
        });
      } finally {
        setChangingLibrary(undefined);
      }
    },
    [withSession],
  );

  // Deletes on this device, then in the library that holds the song;
  // offline or failed deletes are finished by the next full sync.
  const deleteEverywhere = useCallback(
    async (trackId: string) => {
      const current = signedIn ? await openSession().catch(() => undefined) : undefined;
      return deleteTrackEverywhere(trackId, current?.libraries);
    },
    [signedIn, openSession],
  );

  // Playlists and followed libraries follow the user without asking,
  // a moment after each change. They live in the private home repo.
  useEffect(() => {
    if (!signedIn || playlists === undefined || sources === undefined) return;
    const timer = setTimeout(async () => {
      if (running.current) return;
      try {
        const { home } = await openSession();
        await syncPlaylists(home);
        await syncSources(home);
      } catch (problem) {
        // Background work stays quiet when offline or limited; Sync shows it.
        if (!stopReasonOf(problem)) report(problem);
      }
    }, PLAYLIST_SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [signedIn, playlists, sources, openSession, report]);

  // Removing the token stops a sync in progress and forgets the libraries;
  // queued steps stay for later.
  useEffect(() => {
    if (signedIn) return;
    cancelled.current = true;
    clearTimeout(resumeTimer.current);
    session.current = undefined;
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

  const usage: RepoUsage | undefined = libraries && {
    repos: libraries.flatMap((library) => library.repos),
    maxRepoBytes: config.maxRepoBytes,
  };

  return (
    <SyncContext.Provider
      value={{
        usage,
        resumeAt,
        phase,
        error,
        nameTaken,
        last,
        waiting,
        failedItems,
        libraries,
        defaultLibrary: libraries?.find((l) => l.isDefault)?.name,
        changingLibrary,
        sync,
        upload,
        cancel,
        retryFailed,
        loadLibraries,
        addLibrary,
        replaceTakenLibrary,
        setDefaultLibrary,
        setLibraryVisibility,
        signedIn,
        owner: user?.login,
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
