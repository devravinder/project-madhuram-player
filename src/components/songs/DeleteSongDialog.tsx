import { CloudOff, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import Modal from "../Modal";

export type DeleteChoice = "everywhere" | "device";

const choiceClass =
  "cursor-pointer w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors";

// Asks where a backed-up song should be deleted.
export default function DeleteSongDialog({
  title,
  onChoose,
  onClose,
}: {
  title: string;
  onChoose: (choice: DeleteChoice) => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Modal>
      {/* Clicks stay here instead of reaching the song card behind it. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative w-[min(26rem,calc(100vw-2rem))] flex flex-col gap-4 p-6 bg-linear-to-br from-slate-900 to-slate-800 text-white rounded-3xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
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
          Delete “{title}”?
        </h2>
        <p className="text-sm text-slate-300">This song is backed up to GitHub.</p>

        <button
          type="button"
          onClick={() => onChoose("everywhere")}
          className={`${choiceClass} bg-red-500/15 hover:bg-red-500/25`}
        >
          <Trash2 size={20} className="mt-0.5 shrink-0 text-red-400" />
          <span>
            <span className="block font-medium">Delete everywhere</span>
            <span className="block text-sm text-slate-300">
              Removes it from this device, from GitHub and from your other devices.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onChoose("device")}
          className={`${choiceClass} bg-white/5 hover:bg-white/10`}
        >
          <CloudOff size={20} className="mt-0.5 shrink-0" />
          <span>
            <span className="block font-medium">Remove from this device only</span>
            <span className="block text-sm text-slate-300">
              Keeps it on GitHub. A Download sync brings it back.
            </span>
          </span>
        </button>

        <button
          ref={cancelRef}
          type="button"
          onClick={onClose}
          className="cursor-pointer self-end p-2 px-4 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
