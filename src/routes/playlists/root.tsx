import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/playlists/root')({
  component: RouteComponent,
})

function RouteComponent() {
  return <Outlet></Outlet>
}
