import type { SongNames } from "@/services/songsService";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Modal from "../Modal";

const fieldClass =
  "w-full px-3 py-2 rounded-lg bg-white/10 text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-primary";

// Edits a song's title, artist and album.
export default function RenameSongDialog({
  names,
  onSave,
  onClose,
}: {
  names: SongNames;
  onSave: (names: SongNames) => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const ids = { title: useId(), artist: useId(), album: useId() };
  const titleRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(names);

  useEffect(() => {
    titleRef.current?.select();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (field: keyof SongNames) => (value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const unchanged =
    draft.title.trim() === names.title &&
    draft.artist.trim() === names.artist &&
    draft.album.trim() === names.album;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim() || unchanged) return;
    onSave(draft);
  };

  const field = (
    field: keyof SongNames,
    label: string,
    ref?: typeof titleRef,
  ) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={ids[field]} className="text-sm text-slate-300">
        {label}
      </label>
      <input
        id={ids[field]}
        ref={ref}
        value={draft[field]}
        onChange={(event) => set(field)(event.target.value)}
        autoComplete="off"
        className={fieldClass}
      />
    </div>
  );

  return (
    <Modal>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="relative w-[min(26rem,calc(100vw-2rem))] flex flex-col gap-4 p-6 bg-linear-to-br from-slate-900 to-slate-800 text-white rounded-3xl shadow-2xl"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="cursor-pointer absolute top-4 right-4 p-2 rounded-full bg-black/30 hover:bg-black/50"
        >
          <X size={18} />
        </button>

        <h2 id={headingId} className="text-lg font-bold pr-10">
          Rename song
        </h2>

        {field("title", "Title", titleRef)}
        {field("artist", "Artist")}
        {field("album", "Album")}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer p-2 px-4 rounded-lg bg-white/5 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!draft.title.trim() || unchanged}
            className="cursor-pointer p-2 px-4 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
