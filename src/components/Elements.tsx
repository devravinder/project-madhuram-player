import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import type { ComponentProps } from "react";
import { tv } from "tailwind-variants";

// h-dvh: the visible height, so the bottom bar is never under the browser's own bar.
const layout = tv({
  base: "h-dvh w-full overflow-hidden bg-background text-foreground",
});
// The bar stays clear of rounded corners and the home indicator: it grows by
// the phone's safe area (plus a small gap), like the full player's controls.
const footer = tv({
  base: "glass fixed bottom-0 left-0 right-0 h-[calc(4rem+max(env(safe-area-inset-bottom),0.5rem))] pb-[max(env(safe-area-inset-bottom),0.5rem)] flex items-center justify-center px-4 z-10",
});
// The top padding keeps pages clear of a notch, since the page reaches the edges.
const main = tv({
  base: "absolute pt-[env(safe-area-inset-top)] pb-[calc(4rem+max(env(safe-area-inset-bottom),0.5rem))] inset-0 overflow-y-auto",
});
const mainContainer = tv({ base: "h-full flex flex-col relative" });
const mainSection = tv({ base: "flex-1 overflow-y-auto px-4 py-2" });

// Main layout parts: don't change (careful).
export const Layout = ({ className, ...p }: ComponentProps<"div">) => (
  <div className={layout({ className })} {...p} />
);
export const Footer = ({ className, ...p }: ComponentProps<"footer">) => (
  <footer className={footer({ className })} {...p} />
);
export const Main = ({ className, ...p }: ComponentProps<"main">) => (
  <main className={main({ className })} {...p} />
);
export const MainContainer = ({
  className,
  ...p
}: ComponentProps<"section">) => (
  <section className={mainContainer({ className })} {...p} />
);
export const MainSection = ({ className, ...p }: ComponentProps<"section">) => (
  <section className={mainSection({ className })} {...p} />
);

const pageLayout = tv({
  base: "relative h-full flex flex-col gap-6 px-4 pt-2",
});
const pageMain = tv({ base: "flex-1 overflow-y-auto" });
const pageMainContainer = tv({ base: "h-full flex flex-col relative" });
const pageMainSection = tv({ base: "flex-1" });

export const PageLayout = ({ className, ...p }: ComponentProps<"section">) => (
  <section className={pageLayout({ className })} {...p} />
);
export const PageHeader = (p: ComponentProps<"header">) => <header {...p} />;
export const PageMain = ({ className, ...p }: ComponentProps<"div">) => (
  <div className={pageMain({ className })} {...p} />
);
export const PageMainContainer = ({
  className,
  ...p
}: ComponentProps<"div">) => (
  <div className={pageMainContainer({ className })} {...p} />
);
export const PageMainSection = ({
  className,
  ...p
}: ComponentProps<"div">) => (
  <div className={pageMainSection({ className })} {...p} />
);

const iconButton = tv({
  base: "h-10 w-10 relative cursor-pointer bg-accent disabled:cursor-not-allowed flex flex-row justify-center items-center rounded-lg",
  variants: {
    header: {
      true: "p-2 h-12 w-12 sm:h-14 sm:w-14 rounded-xl cursor-default",
    },
  },
});

export const IconButton = ({
  className,
  ...p
}: ComponentProps<"button">) => (
  <button type="button" className={iconButton({ className })} {...p} />
);
export const HeaderIcon = ({ className, ...p }: ComponentProps<"button">) => (
  <button
    type="button"
    className={iconButton({ header: true, className })}
    {...p}
  />
);

const headerTitle = tv({
  base: "text-xl sm:text-2xl font-bold line-clamp-1",
});
const headerSubTitle = tv({
  base: "text-xs sm:text-md text-muted-foreground",
});

export const HeaderTitle = ({ className, ...p }: ComponentProps<"div">) => (
  <div className={headerTitle({ className })} {...p} />
);
export const HeaderSubTitle = ({ className, ...p }: ComponentProps<"div">) => (
  <div className={headerSubTitle({ className })} {...p} />
);

const avatarContainer = tv({
  base: "text-foreground rounded-lg relative inline-flex items-center justify-center overflow-hidden select-none h-10 w-10",
});
const img = tv({
  base: "h-full w-full rounded-2xl object-contain object-center",
});
const coverImg = tv({ base: "h-full w-full rounded-lg object-cover" });
const uppercase = tv({ base: "font-semibold uppercase" });

export const AvatarContainer = ({
  className,
  ...p
}: ComponentProps<"div">) => (
  <div className={avatarContainer({ className })} {...p} />
);
export const Img = ({ className, alt = "", ...p }: ComponentProps<"img">) => (
  <img alt={alt} className={img({ className })} {...p} />
);
export const CoverImg = ({
  className,
  alt = "",
  ...p
}: ComponentProps<"img">) => (
  <img alt={alt} className={coverImg({ className })} {...p} />
);
export const Uppercase = ({ className, ...p }: ComponentProps<"span">) => (
  <span className={uppercase({ className })} {...p} />
);

const songItem = tv({
  base: "relative group flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all duration-200",
  variants: {
    active: { true: "bg-primary/10", false: "hover:bg-secondary/50" },
  },
});

export const SongItem = ({
  active,
  className,
  ...p
}: ComponentProps<"div"> & { active: boolean }) => (
  <div className={songItem({ active, className })} {...p} />
);

const nav = tv({
  base: "flex items-center justify-around py-2 w-full max-w-5xl",
});
const navLink = tv({
  base: "text-muted-foreground flex flex-col items-center gap-1 px-2 py-1 sm:px-4 sm:py-2 rounded-lg transition-colors",
});

export const Nav = ({ className, ...p }: ComponentProps<"nav">) => (
  <nav className={nav({ className })} {...p} />
);
export const NavLink = ({ className, ...p }: ComponentProps<typeof Link>) => (
  <Link className={navLink({ className })} {...p} />
);

const input = tv({
  base: "w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200",
});

export const Input = ({ className, ...p }: ComponentProps<"input">) => (
  <input className={input({ className })} {...p} />
);
export const Textarea = ({ className, ...p }: ComponentProps<"textarea">) => (
  <textarea className={input({ className })} {...p} />
);

const like = tv({
  base: "w-5 h-5 transition-all",
  variants: {
    liked: {
      true: "fill-destructive text-destructive",
      false: "text-foreground",
    },
  },
});

export const Like = ({ liked = false }: { liked?: boolean }) => (
  <Heart className={like({ liked })} />
);

const clickable = tv({ variants: { clickable: { true: "cursor-pointer" } } });

export const Clickable = ({
  clickable: isClickable,
  className,
  ...p
}: ComponentProps<"div"> & { clickable: boolean }) => (
  <div className={clickable({ clickable: isClickable, className })} {...p} />
);

const button = tv({
  base: "cursor-pointer p-2 sm:px-6 sm:py-3 text-xl flex flex-row justify-center items-center gap-2 rounded-lg",
  variants: {
    variant: {
      primary: "bg-primary hover:bg-primary/90 text-primary-foreground",
      secondary: "bg-accent hover:bg-accent/80",
    },
  },
});

const Primary = ({ className, ...p }: ComponentProps<"button">) => (
  <button
    type="button"
    className={button({ variant: "primary", className })}
    {...p}
  />
);
const Secondary = ({ className, ...p }: ComponentProps<"button">) => (
  <button
    type="button"
    className={button({ variant: "secondary", className })}
    {...p}
  />
);

export const Button = { Primary, Secondary };
