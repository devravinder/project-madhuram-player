import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link } from "@tanstack/react-router";
import { Settings, User } from "lucide-react";
import { IconButton } from "./Elements";

const UserProfileDropDown = () => (
  <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <IconButton aria-label="Menu" className="focus-within:outline-none">
        <User />
      </IconButton>
    </DropdownMenu.Trigger>

    <DropdownMenu.Portal>
      <DropdownMenu.Content
        className="glass flex flex-col gap-2 px-4 py-2 mr-8 mt-2 rounded-lg w-48"
        sideOffset={5}
      >
        <DropdownMenu.Item asChild>
          <Link
            to="/settings"
            className="text-muted-foreground flex flex-row items-center gap-2 px-4 py-2 rounded-md hover:bg-secondary/50 cursor-pointer transition-all duration-200"
          >
            <Settings size={20} /> Settings
          </Link>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
);

export default UserProfileDropDown;
