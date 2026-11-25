import { useLocalStorage } from "@/hooks/useLocalStorage";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

// A settings group that folds away; whether it is open is remembered.
// Folded content stays mounted, so it keeps loading in the background.
export default function SettingsSection({
  id,
  title,
  summary,
  children,
}: {
  id: string;
  title: string;
  summary?: ReactNode; // a short line shown even when folded
  children: ReactNode;
}) {
  const [open, setOpen] = useLocalStorage(
    `madhuram.settings.${id}.open`,
    false,
  );

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group border border-card rounded-lg"
    >
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2 p-3">
        <span className="min-w-0">
          <h2 className="font-medium">{title}</h2>
          {summary && (
            <span className="block text-sm text-muted-foreground truncate">
              {summary}
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="px-3 pb-3 flex flex-col gap-3">{children}</div>
    </details>
  );
}
