import { createRootRoute } from "@tanstack/react-router";
import AppLayout from "./-layout/AppLayout";



export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <>
      <AppLayout />
      {/* <TanStackRouterDevtools position="bottom-right" /> */}
    </>
  );
}
