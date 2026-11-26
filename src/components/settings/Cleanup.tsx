import { Button } from "@/components/Elements";
import { useSync } from "@/context/SyncContext";
import {
  getCleanup,
  subscribeCleanup,
  type CleanupRun,
} from "@/services/cleanup/cleanupStore";
import { formatBytes } from "@/services/storageUsage";
import { useQueryClient } from "@tanstack/react-query";
import { Eraser, ExternalLink, Loader2 } from "lucide-react";
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
  return `Last run ${when}. ${result}${songs}`;
}

// Music repos no library uses; the user deletes them on GitHub.
function LeftoverRepos({ owner, repos }: { owner: string; repos: string[] }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="text-muted-foreground">
        Not used by any library. Delete on GitHub if not needed:
      </p>
      <ul className="flex flex-col gap-1">
        {repos.map((repo) => (
          <li key={repo} className="min-w-0">
            <a
              href={`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/settings`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 max-w-full text-highlight underline"
            >
              <span className="truncate font-mono">{repo}</span>
              <ExternalLink size={14} className="shrink-0" />
            </a>
          </li>
        ))}
      </ul>
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
      {!running && last?.owner && !!last.leftoverRepos?.length && (
        <LeftoverRepos owner={last.owner} repos={last.leftoverRepos} />
      )}
    </div>
  );
}
