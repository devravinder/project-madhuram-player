import type { RoutePath } from "@/AppRouter";
import { Heart, Import, ListMusic, Music2, Settings, User } from "lucide-react";
import { Nav, NavLink } from "./Elements";

type NavItem = {
  path: RoutePath;
  label: string;
  icon: typeof User;
};

const navItems: NavItem[] = [
  { path: "/library", label: "Library", icon: Music2 },
  { path: "/playlists", label: "Playlists", icon: ListMusic },
  { path: "/playlists/favourites" as RoutePath, label: "Favourites", icon: Heart },
  { path: "/import", label: "Import", icon: Import },
  { path: "/settings", label: "Settings", icon: Settings },
];
export function Navigation() {
  return (
    <Nav>
      {navItems.map((item) => (
        <NavLink
          to={item.path}
          key={item.path}
          activeProps={{
            className: "text-primary",
          }}
          activeOptions={{ exact: true }}
        >
          <item.icon className="h-6 w-6 sm:h-5 sm:w-5" />
          <span className="text-xs hidden sm:block">{item.label}</span>
        </NavLink>
      ))}
    </Nav>
  );
}
