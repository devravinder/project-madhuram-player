import { Button, Input } from "@/components/Elements";
import { useSync, type LastRun } from "@/context/SyncContext";
import { useAuth } from "@/hooks/useAuth";
import { authStore } from "@/services/github/authStore";
import { CloudDownload, RefreshCcw, Square } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import NotBackedUp from "./NotBackedUp";
import Libraries from "./Libraries";

const STOP_TEXT = {
  offline: "Offline. Will sync when back online.",
  "rate-limit": "GitHub limit reached.",
  auth: "Token rejected. Sign in again.",
  cancelled: "Stopped.",
} as const;

function summarize(last: LastRun | undefined) {
  if (!last) return "";
  if (last.stoppedBy) return STOP_TEXT[last.stoppedBy];
  if (last.queued === 0 && last.done === 0) return "Up to date.";
  const failed = last.failed > 0 ? `, ${last.failed} failed` : "";
  return `Synced ${last.done}${failed}.`;
}

// Shown when a library name belongs to a repo that is not a music library.
function RepoNameForm({ taken }: { taken: string }) {
  const { replaceTakenLibrary } = useSync();
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(await replaceTakenLibrary(name));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <p role="alert" className="text-sm text-destructive">
        {taken} already exists and is not a music library. Choose another name.
      </p>
      <label htmlFor="repo-name" className="text-sm font-medium">
        Library name
      </label>
      <Input
        id="repo-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="my-music-library"
        autoComplete="off"
        spellCheck={false}
      />
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <Button.Primary type="submit" disabled={!name.trim()} className="text-base justify-center">
        Use this name
      </Button.Primary>
    </form>
  );
}

export default function SyncSettings() {
  const { status, user } = useAuth();
  const {
    phase,
    error,
    nameTaken,
    last,
    waiting,
    failedItems,
    sync,
    cancel,
    retryFailed,
    resumeAt,
    keptOnGithub,
    loadLibraries,
  } = useSync();

  // Opening the screen connects, so the libraries can be shown.
  const signedIn = status === "signed-in";
  useEffect(() => {
    if (signedIn) void loadLibraries();
  }, [signedIn, loadLibraries]);

  if (!signedIn) return null;

  const busy = phase !== "idle";
  const statusText = busy
    ? phase === "connecting"
      ? "Connecting..."
      : `Syncing... ${waiting} left`
    : waiting > 0
      ? `${waiting} waiting. ${summarize(last)}`
      : summarize(last);

  return (
    <section
      aria-labelledby="sync-title"
      className="border border-card rounded-lg p-3 flex flex-col gap-3"
    >
      <div>
        <h2 id="sync-title" className="font-medium">
          GitHub backup
        </h2>
        <p className="text-sm text-muted-foreground">{user?.login}</p>
      </div>

      {nameTaken && <RepoNameForm taken={nameTaken} />}

      <div className="flex flex-wrap gap-2">
        <Button.Primary
          onClick={() => void sync("both")}
          disabled={busy}
          className="text-base disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <RefreshCcw size={18} /> Sync
        </Button.Primary>
        <Button.Secondary
          onClick={() => void sync("download")}
          disabled={busy}
          className="text-base disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <CloudDownload size={18} /> Download
        </Button.Secondary>
        {busy && (
          <Button.Secondary onClick={cancel} className="text-base">
            <Square size={18} /> Stop
          </Button.Secondary>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Sync gets songs from your other devices. New songs upload only from the list below.
      </p>

      <NotBackedUp />

      {keptOnGithub > 0 && (
        <p className="text-sm text-muted-foreground">
          {keptOnGithub} on GitHub only. Download to get {keptOnGithub === 1 ? "it" : "them"} back.
        </p>
      )}

      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {statusText}
        {!busy && resumeAt && (
          <> Retrying at {new Date(resumeAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</>
        )}
      </p>

      {!busy && last?.stoppedBy === "auth" && (
        <Button.Secondary
          onClick={() => {
            authStore.removeToken();
            authStore.requestLogin();
          }}
          className="self-start text-base"
        >
          Sign in again
        </Button.Secondary>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {failedItems.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-destructive">{failedItems.length} failed.</p>
          <ul className="text-xs text-muted-foreground list-disc pl-5">
            {failedItems.slice(0, 5).map((item) => (
              <li key={item.id}>{item.lastError ?? "Unknown error"}</li>
            ))}
          </ul>
          <Button.Secondary onClick={() => void retryFailed()} disabled={busy} className="text-base">
            Retry
          </Button.Secondary>
        </div>
      )}

      <Libraries />
    </section>
  );
}
