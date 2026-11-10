import { Button } from "@/components/Elements";
import {
  createRootRoute,
  Link,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { RefreshCcw } from "lucide-react";
import AppLayout from "./-layout/AppLayout";

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: RouteError,
  notFoundComponent: NotFound,
});

function RootComponent() {
  return <AppLayout />;
}

// A crash in one page must not leave the whole app blank.
function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  console.error(error);

  return (
    <main
      role="alert"
      className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-background text-foreground"
    >
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-muted-foreground max-w-sm">
        Your music is safe on this device. Try again, or reload the app.
      </p>
      <div className="flex gap-2">
        <Button.Primary
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          Try again
        </Button.Primary>
        <Button.Secondary onClick={() => window.location.reload()}>
          <RefreshCcw size={18} /> Reload
        </Button.Secondary>
      </div>
    </main>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <h1 className="text-xl font-bold">Page not found</h1>
      <Link to="/library" className="text-primary underline">
        Go to your library
      </Link>
    </div>
  );
}
