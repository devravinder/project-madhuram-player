import { Toaster } from "sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import LoginPage from "@/components/auth/LoginPage";
import { PlayerProvider } from "@/context/PlayerContext";
import { PlaylistProvider } from "@/context/PlaylistContext";
import { SyncProvider } from "@/context/SyncContext";
import { useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { queryClient } from "@/query-client";
import type { CSSProperties, ReactNode } from "react";
import AppRouter from "./AppRouter";
import PWABadge from "./PWABadge";
import { DevToolProvider } from "./context/DevToolContext";

// Login comes first, but "Try without login" lets anyone in.
function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  return status === "signed-out" ? <LoginPage /> : children;
}

const ContextProviders = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <DevToolProvider>
      <ThemeProvider>
        <PlaylistProvider>
          <SyncProvider>
            <PlayerProvider>
              {/* Every notice can be closed, with the × at the top right. */}
              <Toaster
                position="top-center"
                closeButton
                style={
                  {
                    "--toast-close-button-start": "unset",
                    "--toast-close-button-end": "0",
                    "--toast-close-button-transform": "translate(35%, -35%)",
                  } as CSSProperties
                }
              />
              {children}
            </PlayerProvider>
          </SyncProvider>
        </PlaylistProvider>
      </ThemeProvider>
    </DevToolProvider>
  </QueryClientProvider>
);

export default function App() {
  return (
    <ContextProviders>
      <AuthGate>
        <AppRouter />
      </AuthGate>
      <PWABadge />
    </ContextProviders>
  );
}
