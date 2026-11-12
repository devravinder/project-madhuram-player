import { Button, Input } from "@/components/Elements";
import { config } from "@/config";
import { useSync, type LibraryInfo } from "@/context/SyncContext";
import { suggestLibraryName } from "@/services/github/session";
import { shareLink } from "@/services/shareLink";
import { formatBytes } from "@/services/storageUsage";
import { Globe, Link2, Lock, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

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

const SHARE_WARNING =
  "Make this library public?\n\n" +
  "Anyone with the link can play and download its songs.\n" +
  "Songs deleted earlier can still be found in its history on GitHub.\n" +
  "Share only music you have the right to share.";

function LibraryRow({ library, owner }: { library: LibraryInfo; owner: string }) {
  const { setLibraryVisibility, setDefaultLibrary, changingLibrary } = useSync();
  const changing = changingLibrary === library.name;

  const toggle = () => {
    if (library.isPrivate && !window.confirm(SHARE_WARNING)) return;
    void setLibraryVisibility(library.name, !library.isPrivate);
  };

  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-2">
        {library.isPrivate ? (
          <Lock size={16} aria-hidden className="shrink-0 text-muted-foreground" />
        ) : (
          <Globe size={16} aria-hidden className="shrink-0 text-highlight" />
        )}
        <span className="flex-1 min-w-0">
          <span className="block font-mono text-sm truncate">{library.name}</span>
          <span className="block text-xs text-muted-foreground">
            {library.tracks} songs · {formatBytes(library.usedBytes)}
            {library.isDefault && " · default"}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pl-6">
        <button
          type="button"
          onClick={toggle}
          disabled={changing}
          aria-label={library.isPrivate ? `Make ${library.name} public` : `Make ${library.name} private`}
          className="cursor-pointer px-2 py-1 rounded-md text-sm bg-accent hover:bg-accent/80 disabled:opacity-60"
        >
          {changing ? "Changing..." : library.isPrivate ? "Make public" : "Make private"}
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
      </div>
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
        <Button.Primary type="submit" disabled={!name.trim() || saving} className="text-base">
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
    return <p className="text-sm text-muted-foreground">Loading libraries...</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium">Libraries</h3>
      <ul className="flex flex-col divide-y divide-card">
        {libraries.map((library) => (
          <LibraryRow key={library.name} library={library} owner={owner} />
        ))}
      </ul>
      <AddLibrary taken={libraries.map((l) => l.name)} />
    </div>
  );
}
