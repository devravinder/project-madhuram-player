import Avatar from "@/components/Avatar";
import ThemeToggle from "@/components/ThemeToggle";
import UserProfileDropDown from "@/components/UserProfileDropDown";

export default function HeaderContent() {
  return (
    <>
        <Avatar src="/favicon.svg" name="Avatar" />
        <div className="flex flex-row gap-2">
          <ThemeToggle />
          <UserProfileDropDown/>
        </div>
    </>
  );
}
