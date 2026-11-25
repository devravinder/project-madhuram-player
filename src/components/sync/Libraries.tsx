import { Button, Input } from "@/components/Elements";
import { config } from "@/config";
import { useSync, type LibraryInfo } from "@/context/SyncContext";
import { suggestLibraryName } from "@/services/github/session";
import { confirmToast } from "@/services/confirmToast";
import { shareLink } from "@/services/shareLink";
import { formatBytes } from "@/services/storageUsage";
import { Globe, Link2, Lock, Plus, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

// Deleting a repo cannot be undone, so the name is typed to confirm, the
// way GitHub itself asks.
function DeleteLibrary({
  library,
  onClose,
}: {
  library: LibraryInfo;
  onClose: () => void;
}) {
  const { deleteLibrary } = useSync();
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (typed !== library.name) return;
    setBusy(true);
    const failure = await deleteLibrary(library.name);
    setBusy(false);
    if (failure) {
      setProblem(failure);
      return;
    }
    toast.success(`Deleted ${library.name}`);
    onClose();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 pl-6">
      <p className="text-sm text-destructive">
        Deletes {library.name} and its {library.tracks} songs from GitHub, with
        its overflow repos. This cannot be undone.
        {!library.isPrivate && " People you shared it with lose access."}
      </p>
      <p className="text-sm text-muted-foreground">
        Songs on this device stay, and show as not backed up.
      </p>
      <label htmlFor={inputId} className="text-sm">
        Type <span className="font-mono">{library.name}</span> to confirm
      </label>
      <Input
        id={inputId}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={typed !== library.name || busy}
          className="cursor-pointer px-2 py-1 rounded-md text-sm bg-destructive text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Deleting..." : "Delete library"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="cursor-pointer px-2 py-1 rounded-md text-sm hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

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

function LibraryRow({
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
  const changing = changingLibrary === library.name;
  const [deleting, setDeleting] = useState(false);

  const toggle = async () => {
    if (library.isPrivate) {
      const yes = await confirmToast({
        title: `Make ${library.name} public?`,
        description:
          "Anyone with the link can play and download its songs. Songs deleted earlier can still be found in its GitHub history. Share only music you have the right to share.",
        confirmLabel: "Make public",
        destructive: true,
      });
      if (!yes) return;
    }
    void setLibraryVisibility(library.name, !library.isPrivate);
  };

  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-2">
        {library.isPrivate ? (
          <Lock
            size={16}
            aria-hidden
            className="shrink-0 text-muted-foreground"
          />
        ) : (
          <Globe size={16} aria-hidden className="shrink-0 text-highlight" />
        )}
        <span className="flex-1 min-w-0">
          <span className="block font-mono text-sm truncate">
            {library.name}
          </span>
          <span className="block text-xs text-muted-foreground">
            {library.tracks} songs · {formatBytes(library.usedBytes)}
            {library.isDefault && " · default"}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pl-6">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={changing}
          aria-label={
            library.isPrivate
              ? `Make ${library.name} public`
              : `Make ${library.name} private`
          }
          className="cursor-pointer px-2 py-1 rounded-md text-sm bg-accent hover:bg-accent/80 disabled:opacity-60"
        >
          {changing
            ? "Changing..."
            : library.isPrivate
              ? "Make public"
              : "Make private"}
        </button>
        {!library.isPrivate && (
          <button
            type="button"
            onClick={() => void copyLink(owner, library.name)}
            aria-label={`Copy link to ${library.name}`}
            className="cursor-pointer flex items-center gap-1 px-2 py-1 rounded-md text-sm bg-accent hover:bg-accent/80"
          >
            <Link2 size={14} /> Copy link
          </button>
        )}
        {!library.isDefault && (
          <button
            type="button"
            onClick={() => void setDefaultLibrary(library.name)}
            aria-label={`Make ${library.name} the default`}
            className="cursor-pointer px-2 py-1 rounded-md text-sm hover:bg-accent"
          >
            Make default
          </button>
        )}
        {canDelete && !deleting && (
          <button
            type="button"
            onClick={() => setDeleting(true)}
            aria-label={`Delete ${library.name}`}
            className="cursor-pointer flex items-center gap-1 px-2 py-1 rounded-md text-sm text-destructive hover:bg-accent"
          >
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>
      {deleting && (
        <DeleteLibrary library={library} onClose={() => setDeleting(false)} />
      )}
    </li>
  );
}

function AddLibrary({ taken }: { taken: string[] }) {
  const { addLibrary } = useSync();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string>();
  const [saving, setSaving] = useState(false);

  const start = () => {
    setName(suggestLibraryName(config.libraryRepoName, taken));
    setProblem(undefined);
    setOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const failure = await addLibrary(name);
    setSaving(false);
    setProblem(failure);
    if (!failure) setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={start}
        className="cursor-pointer self-start flex items-center gap-1 px-2 py-1 rounded-md text-sm hover:bg-accent"
      >
        <Plus size={16} /> Add library
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="new-library" className="text-sm font-medium">
        New library name
      </label>
      <Input
        id="new-library"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <Button.Primary
          type="submit"
          disabled={!name.trim() || saving}
          className="text-base"
        >
          {saving ? "Creating..." : "Create"}
        </Button.Primary>
        <Button.Secondary onClick={() => setOpen(false)} className="text-base">
          Cancel
        </Button.Secondary>
      </div>
    </form>
  );
}

// The user's libraries: each private or public on its own, so only the
// chosen ones are shared.
export default function Libraries() {
  const { libraries, owner } = useSync();

  if (!libraries || !owner) {
    return (
      <p className="text-sm text-muted-foreground">Loading libraries...</p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium">Libraries</h3>
      <ul className="flex flex-col divide-y divide-card">
        {libraries.map((library) => (
          <LibraryRow
            key={library.name}
            library={library}
            owner={owner}
            canDelete={libraries.length > 1}
          />
        ))}
      </ul>
      <AddLibrary taken={libraries.map((l) => l.name)} />
    </div>
  );
}
