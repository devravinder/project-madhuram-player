import { Button, IconButton } from "@/components/Elements";
import { useSync } from "@/context/SyncContext";
import {
  getCleanup,
  subscribeCleanup,
  type CleanupRun,
} from "@/services/cleanup/cleanupStore";
import { formatBytes } from "@/services/storageUsage";
import { useQueryClient } from "@tanstack/react-query";
import { Eraser, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { useSyncExternalStore } from "react";

function lastRunText(last: CleanupRun) {
  const when = new Date(last.at).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const freed = last.deviceBytes + last.githubBytes;
  const result =
    freed > 0 ? `Freed ${formatBytes(freed)}.` : "Nothing to clean.";
  const broken = last.brokenSongs ?? 0;
  const songs =
    broken > 0
      ? ` Removed ${broken} ${broken === 1 ? "song" : "songs"} with a missing file.`
      : "";
  const repos = last.deletedRepos ?? 0;
  const deletedRepos =
    repos > 0 ? ` Deleted ${repos} ${repos === 1 ? "repo" : "repos"}.` : "";
  return `Last run ${when}. ${result}${songs}${deletedRepos}`;
}

// Music repos no library uses; deleted on GitHub after a confirmation.
function LeftoverRepos({
  owner,
  repos,
  disabled,
}: {
  owner: string;
  repos: string[];
  disabled: boolean;
}) {
  const { deleteLeftovers } = useSync();
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="text-muted-foreground">Not used by any library:</p>
      <ul className="flex flex-col gap-1">
        {repos.map((repo) => (
          <li key={repo} className="flex items-center gap-2 min-w-0">
            <a
              href={`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-0 inline-flex items-center gap-1 text-highlight underline"
            >
              <span className="truncate font-mono">{repo}</span>
              <ExternalLink size={14} className="shrink-0" />
            </a>
            <IconButton
              aria-label={`Delete ${repo}`}
              disabled={disabled}
              onClick={() => void deleteLeftovers([repo])}
              className="h-8 w-8 shrink-0 text-destructive disabled:opacity-60"
            >
              <Trash2 size={16} />
            </IconButton>
          </li>
        ))}
      </ul>
      {repos.length > 1 && (
        <Button.Secondary
          disabled={disabled}
          onClick={() => void deleteLeftovers(repos)}
          className="self-start text-base text-destructive disabled:opacity-60"
        >
          <Trash2 size={18} /> Delete all
        </Button.Secondary>
      )}
    </div>
  );
}

// Removes files no song uses, here and on GitHub.
export default function Cleanup() {
  const { cleanUp, phase } = useSync();
  const queryClient = useQueryClient();
  const { running, last, error } = useSyncExternalStore(
    subscribeCleanup,
    getCleanup,
  );
  const syncing = phase !== "idle";

  const start = async () => {
    await cleanUp();
    await queryClient.invalidateQueries({ queryKey: ["device-usage"] });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button.Secondary
        onClick={() => void start()}
        disabled={running || syncing}
        aria-busy={running}
        className="self-start text-base disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {running ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Eraser size={18} />
        )}
        {running ? "Cleaning..." : "Clean up"}
      </Button.Secondary>
      <p role="status" className="text-sm text-muted-foreground">
        {running
          ? "Removing unused files. You can leave this page."
          : last
            ? lastRunText(last)
            : "Removes unused files here and on GitHub."}
      </p>
      {error && !running && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {last?.owner && !!last.leftoverRepos?.length && (
        <LeftoverRepos
          owner={last.owner}
          repos={last.leftoverRepos}
          disabled={running || syncing}
        />
      )}
    </div>
  );
}
