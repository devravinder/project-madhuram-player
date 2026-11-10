import {
  createRouter,
  RouterProvider,
  createHashHistory,
} from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const history = createHashHistory();

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  history,
});

// Register things for typesafety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export type RoutePath = keyof typeof router.routesByPath;

export default function AppRouter() {
  //  basepath="/" Important for subdomain
  return <RouterProvider basepath="/" router={router} />;
}
