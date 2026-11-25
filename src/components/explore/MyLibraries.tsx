import AppDialog, { dialogFieldClass } from "@/components/AppDialog";
import { IconButton } from "@/components/Elements";
import { config } from "@/config";
import { useSync, type LibraryInfo } from "@/context/SyncContext";
import { MAX_DISPLAY_NAME } from "@/services/github/indexTypes";
import { suggestLibraryName } from "@/services/github/session";
import { confirmToast } from "@/services/confirmToast";
import { shareLink } from "@/services/shareLink";
import { formatBytes } from "@/services/storageUsage";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link } from "@tanstack/react-router";
import {
  Globe,
  Link2,
  Lock,
  MoreVertical,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

const itemClass =
  "outline-none text-muted-foreground flex flex-row items-center gap-2 px-4 py-2 rounded-md hover:bg-secondary/50 cursor-pointer transition-all duration-200";

const labelOf = (library: LibraryInfo) => library.displayName ?? library.name;

async function copyLink(owner: string, library: string) {
  const link = shareLink(owner, library);
  try {
    await navigator.clipboard.writeText(link);
    toast.success("Link copied");
  } catch {
    // Clipboard can be blocked; show the link so it can be copied by hand.
    toast(link, { duration: 15000 });
  }
}

function CreateLibraryDialog({
  taken,
  onClose,
}: {
  taken: string[];
  onClose: () => void;
}) {
  const { addLibrary } = useSync();
  const inputId = useId();
  const [name, setName] = useState(() =>
    suggestLibraryName(config.libraryRepoName, taken),
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const create = async () => {
    setBusy(true);
    const failure = await addLibrary(name);
    setBusy(false);
    if (failure) setProblem(failure);
    else onClose();
  };

  return (
    <AppDialog
      title="New library"
      confirmLabel="Create"
      busyLabel="Creating..."
      busy={busy}
      canConfirm={!!name.trim()}
      problem={problem}
      onConfirm={() => void create()}
      onClose={onClose}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm text-slate-300">
          Repo name
        </label>
        <input
          id={inputId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={dialogFieldClass}
        />
      </div>
    </AppDialog>
  );
}

function RenameLibraryDialog({
  library,
  onClose,
}: {
  library: LibraryInfo;
  onClose: () => void;
}) {
  const { renameLibrary } = useSync();
  const inputId = useId();
  const [name, setName] = useState(labelOf(library));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const save = async () => {
    setBusy(true);
    const failure = await renameLibrary(library.name, name);
    setBusy(false);
    if (failure) setProblem(failure);
    else onClose();
  };

  return (
    <AppDialog
      title="Rename library"
      confirmLabel="Save"
      busyLabel="Saving..."
      busy={busy}
      problem={problem}
      onConfirm={() => void save()}
      onClose={onClose}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm text-slate-300">
          Name
        </label>
        <input
          id={inputId}
          value={name}
          maxLength={MAX_DISPLAY_NAME}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          className={dialogFieldClass}
        />
        <p className="text-xs text-slate-400">Shared links stay the same.</p>
      </div>
    </AppDialog>
  );
}

function DeleteLibraryDialog({
  library,
  onClose,
}: {
  library: LibraryInfo;
  onClose: () => void;
}) {
  const { deleteLibrary } = useSync();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const remove = async () => {
    setBusy(true);
    const failure = await deleteLibrary(library.name);
    setBusy(false);
    if (failure) {
      setProblem(failure);
      return;
    }
    toast.success(`Deleted ${labelOf(library)}`);
    onClose();
  };

  return (
    <AppDialog
      title={`Delete ${labelOf(library)}?`}
      confirmLabel="Delete"
      busyLabel="Deleting..."
      destructive
      busy={busy}
      problem={problem}
      onConfirm={() => void remove()}
      onClose={onClose}
    >
      <p className="text-sm text-slate-300">
        This can't be undone. It is deleted on GitHub too. Songs on this device
        stay.
      </p>
    </AppDialog>
  );
}

type Open = "rename" | "delete" | undefined;

function LibraryMenu({
  library,
  owner,
  canDelete,
}: {
  library: LibraryInfo;
  owner: string;
  canDelete: boolean;
}) {
  const { setLibraryVisibility, setDefaultLibrary, changingLibrary } =
    useSync();
  const [open, setOpen] = useState<Open>();
  const label = labelOf(library);

  const toggleVisibility = async () => {
    if (library.isPrivate) {
      const yes = await confirmToast({
        title: `Make ${label} public?`,
        description: "Anyone with the link can play it.",
        confirmLabel: "Make public",
        destructive: true,
      });
      if (!yes) return;
    }
    await setLibraryVisibility(library.name, !library.isPrivate);
  };

  return (
    <>
      {open === "rename" && (
        <RenameLibraryDialog
          library={library}
          onClose={() => setOpen(undefined)}
        />
      )}
      {open === "delete" && (
        <DeleteLibraryDialog
          library={library}
          onClose={() => setOpen(undefined)}
        />
      )}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <IconButton
            aria-label={`More for ${library.name}`}
            className="h-9 w-9 shrink-0"
          >
            <MoreVertical size={20} />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={5}
            className="glass flex flex-col gap-1 px-2 py-2 rounded-lg w-52 z-50"
          >
            <DropdownMenu.Item
              disabled={changingLibrary === library.name}
              onSelect={() => void toggleVisibility()}
              className={itemClass}
            >
              {library.isPrivate ? <Globe size={18} /> : <Lock size={18} />}
              {library.isPrivate ? "Make public" : "Make private"}
            </DropdownMenu.Item>
            {!library.isPrivate && (
              <DropdownMenu.Item
                onSelect={() => void copyLink(owner, library.name)}
                className={itemClass}
              >
                <Link2 size={18} /> Copy link
              </DropdownMenu.Item>
            )}
            {!library.isDefault && (
              <DropdownMenu.Item
                onSelect={() => void setDefaultLibrary(library.name)}
                className={itemClass}
              >
                <Star size={18} /> Make default
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item
              onSelect={() => setOpen("rename")}
              className={itemClass}
            >
              <Pencil size={18} /> Rename
            </DropdownMenu.Item>
            {canDelete && (
              <DropdownMenu.Item
                onSelect={() => setOpen("delete")}
                className={`${itemClass} text-destructive`}
              >
                <Trash2 size={18} /> Delete
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}

// Two rows, so long names fit on a phone: name and menu, then the details.
function LibraryCard({
  library,
  owner,
  canDelete,
}: {
  library: LibraryInfo;
  owner: string;
  canDelete: boolean;
}) {
  const { changingLibrary } = useSync();
  const details = [
    `${library.tracks} songs`,
    formatBytes(library.usedBytes),
    library.isDefault ? "default" : undefined,
    changingLibrary === library.name ? "changing..." : undefined,
  ].filter(Boolean);

  return (
    <li className="border border-card rounded-lg p-2 flex flex-col gap-1">
      <div className="flex items-center gap-2 min-w-0">
        {library.isPrivate ? (
          <Lock
            size={16}
            aria-label="Private"
            className="shrink-0 text-muted-foreground"
          />
        ) : (
          <Globe
            size={16}
            aria-label="Public"
            className="shrink-0 text-highlight"
          />
        )}
        <Link
          to="/explore/$owner/$repo"
          params={{ owner, repo: library.name }}
          className="flex-1 min-w-0 truncate font-medium"
        >
          {labelOf(library)}
        </Link>
        <LibraryMenu library={library} owner={owner} canDelete={canDelete} />
      </div>
      <p className="pl-6 text-xs text-muted-foreground truncate">
        {details.join(" · ")}
        {library.displayName && (
          <span className="font-mono"> · {library.name}</span>
        )}
      </p>
    </li>
  );
}

// The signed-in user's libraries, private ones too, with everything to
// manage them: create, share, rename and delete.
export default function MyLibraries() {
  const { libraries, owner, loadLibraries, error } = useSync();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!libraries) void loadLibraries();
  }, [libraries, loadLibraries]);

  const ready = !!libraries && !!owner;

  return (
    <section className="flex flex-col gap-2" aria-labelledby="my-libraries">
      <div className="flex items-center justify-between gap-2">
        <h2 id="my-libraries" className="text-sm font-medium">
          My libraries
        </h2>
        {ready && (
          <IconButton
            aria-label="New library"
            onClick={() => setCreating(true)}
            className="h-9 w-9"
          >
            <Plus size={20} />
          </IconButton>
        )}
      </div>
      {creating && libraries && (
        <CreateLibraryDialog
          taken={libraries.map((l) => l.name)}
          onClose={() => setCreating(false)}
        />
      )}
      {!libraries || !owner ? (
        <p className="text-muted-foreground">{error ?? "Loading..."}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {libraries.map((library) => (
              <LibraryCard
                key={library.name}
                library={library}
                owner={owner}
                canDelete={libraries.length > 1}
              />
            ))}
          </ul>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
