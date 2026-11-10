import { Button, Input } from "@/components/Elements";
import { useSync, type LastRun } from "@/context/SyncContext";
import { useAuth } from "@/hooks/useAuth";
import { authStore } from "@/services/github/authStore";
import { CloudDownload, RefreshCcw, Square } from "lucide-react";
import { useState, type FormEvent } from "react";
import NotBackedUp from "./NotBackedUp";

const STOP_TEXT = {
  offline: "You are offline. Waiting items will sync when you reconnect.",
  "rate-limit": "GitHub asked us to slow down.",
  auth: "GitHub rejected the token. Remove it and sign in again.",
  cancelled: "Stopped. Waiting items stay queued.",
} as const;

function summarize(last: LastRun | undefined) {
  if (!last) return "";
  if (last.stoppedBy) return STOP_TEXT[last.stoppedBy];
  if (last.queued === 0 && last.done === 0) return "Everything is up to date.";
  const failed = last.failed > 0 ? `, ${last.failed} failed` : "";
  return `Synced ${last.done} item${last.done === 1 ? "" : "s"}${failed}.`;
}

function RepoNameForm({ taken }: { taken?: string }) {
  const { changeRepoName, sync } = useSync();
  const [name, setName] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (changeRepoName(name)) {
      setInvalid(false);
      void sync();
    } else {
      setInvalid(true);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <p role="alert" className="text-sm text-destructive">
        {taken
          ? `A repository named ${taken} already exists and is not a Madhuram library. Choose another name.`
          : "Choose a repository name."}
      </p>
      <label htmlFor="repo-name" className="text-sm font-medium">
        Library repository name
      </label>
      <Input
        id="repo-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="my-music-library"
        autoComplete="off"
        spellCheck={false}
      />
      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          Use letters, numbers, dots, dashes or underscores.
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
    repoName,
    waiting,
    failedItems,
    sync,
    cancel,
    retryFailed,
    resumeAt,
    keptOnGithub,
  } = useSync();

  if (status !== "signed-in") return null;

  const busy = phase !== "idle";
  const statusText = busy
    ? phase === "connecting"
      ? "Connecting to GitHub..."
      : `Syncing... ${waiting} waiting`
    : waiting > 0
      ? `${waiting} waiting to sync. ${summarize(last)}`
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
        <p className="text-sm text-muted-foreground">
          {user?.login}/{repoName}
        </p>
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
        Sync brings in songs from your other devices and keeps playlists in step. New
        songs go to GitHub only when you upload them below.
      </p>

      <NotBackedUp />

      {keptOnGithub > 0 && (
        <p className="text-sm text-muted-foreground">
          {keptOnGithub === 1 ? "1 song is" : `${keptOnGithub} songs are`} kept on
          GitHub only. Download brings {keptOnGithub === 1 ? "it" : "them"} back to
          this device.
        </p>
      )}

      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {statusText}
        {!busy && resumeAt && (
          <> Continues by itself at {new Date(resumeAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.</>
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
          <p className="text-sm text-destructive">
            {failedItems.length} item{failedItems.length === 1 ? "" : "s"} could not be synced:
          </p>
          <ul className="text-xs text-muted-foreground list-disc pl-5">
            {failedItems.slice(0, 5).map((item) => (
              <li key={item.id}>
                {item.op} {item.trackId.slice(0, 8)}: {item.lastError ?? "unknown error"}
              </li>
            ))}
          </ul>
          <Button.Secondary onClick={() => void retryFailed()} disabled={busy} className="text-base">
            Retry failed
          </Button.Secondary>
        </div>
      )}
    </section>
  );
}
