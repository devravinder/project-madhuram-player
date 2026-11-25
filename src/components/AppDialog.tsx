import { X } from "lucide-react";
import { useEffect, useId, type FormEvent, type ReactNode } from "react";
import Modal from "./Modal";

export const dialogFieldClass =
  "w-full px-3 py-2 rounded-lg bg-white/10 text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-primary";

// A small in-app dialog with a title, a close button and two actions.
export default function AppDialog({
  title,
  children,
  confirmLabel,
  busyLabel,
  busy = false,
  canConfirm = true,
  destructive = false,
  problem,
  onConfirm,
  onClose,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  canConfirm?: boolean;
  destructive?: boolean;
  problem?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const headingId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canConfirm && !busy) onConfirm();
  };

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
          disabled={busy}
          className="cursor-pointer absolute top-4 right-4 p-2 rounded-full bg-black/30 hover:bg-black/50"
        >
          <X size={18} />
        </button>

        <h2 id={headingId} className="text-lg font-bold pr-10 break-words">
          {title}
        </h2>
        {children}
        {problem && (
          <p role="alert" className="text-sm text-red-300">
            {problem}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="cursor-pointer p-2 px-4 rounded-lg bg-white/5 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canConfirm || busy}
            className={`cursor-pointer p-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
              destructive
                ? "bg-red-600 text-white"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
