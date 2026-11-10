import {
  HeaderTitle,
  IconButton,
  PageHeader,
  PageLayout,
  PageMain,
  PageMainContainer,
  PageMainSection,
} from "@/components/Elements";
import { BugPlay, KeyRound, LogIn, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import SyncSettings from "@/components/sync/SyncSettings";
import ThemeToggle from "@/components/ThemeToggle";
import { useDevTools } from "@/context/DevToolContext";
import { useAuth } from "@/hooks/useAuth";
import { clearDataWithPrompt } from "@/services/db";
import { authStore } from "@/services/github/authStore";
import { TOKEN_SETTINGS_URL } from "@/services/github/githubClient";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  component: RouteComponent,
});

const showDevTools = import.meta.env.DEV;

const rowClass =
  "border border-card rounded-lg p-2 flex flex-row items-center justify-between gap-2";

function RouteComponent() {
  const { toggleDevTools } = useDevTools();
  const { status, user } = useAuth();

  const removeToken = () => {
    if (!window.confirm("Remove the GitHub token from this device?")) return;
    authStore.removeToken();
    toast("Token removed from this device", {
      description: "To revoke it fully, also delete it on GitHub.",
      duration: 15000,
      action: {
        label: "Open GitHub",
        onClick: () =>
          window.open(TOKEN_SETTINGS_URL, "_blank", "noopener,noreferrer"),
      },
    });
  };

  return (
    <PageLayout>
      <PageHeader>
        <HeaderTitle>Settings</HeaderTitle>
      </PageHeader>
      <PageMain>
        <PageMainContainer>
          <PageMainSection>
            <div className="flex flex-col gap-2">
              <div className={rowClass}>
                <span>
                  {status === "signed-in"
                    ? `Signed in as ${user?.login ?? "GitHub user"}`
                    : "Not signed in"}
                </span>
                {status === "signed-in" ? (
                  <IconButton aria-label="Remove token" onClick={removeToken}>
                    <KeyRound className="h-5 w-5" />
                  </IconButton>
                ) : (
                  <IconButton
                    aria-label="Sign in"
                    onClick={authStore.requestLogin}
                  >
                    <LogIn className="h-5 w-5" />
                  </IconButton>
                )}
              </div>
              <SyncSettings />
              {showDevTools && (
                <div className={rowClass}>
                  <span>Dev Tools</span>
                  <IconButton aria-label="Toggle dev tools" onClick={toggleDevTools}>
                    <BugPlay className="h-5 w-5" />
                  </IconButton>
                </div>
              )}
              <div className={rowClass}>
                <span>Change Theme</span> <ThemeToggle />
              </div>
              <div className={rowClass}>
                <span>Clear Data</span>
                <IconButton
                  aria-label="Clear data"
                  onClick={() =>
                    clearDataWithPrompt("Do you want to clear the data")
                  }
                >
                  <Trash2 className="h-5 w-5" />
                </IconButton>
              </div>
              <div className={rowClass}>
                <span>Refresh</span>
                <IconButton
                  aria-label="Refresh"
                  onClick={() => {
                    toast("Refreshing...");
                    window.location.reload();
                  }}
                >
                  <RefreshCcw className="h-5 w-5" />
                </IconButton>
              </div>
            </div>
          </PageMainSection>
        </PageMainContainer>
      </PageMain>
    </PageLayout>
  );
}
