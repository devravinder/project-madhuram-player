import { toast } from "sonner";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean; // shows the confirm button in red
};

// Asks in an in-app notice instead of a browser pop-up. Resolves true only
// when the confirm button is pressed; Cancel, × or swiping it away is false.
export function confirmToast({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
}: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const answer = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    toast(title, {
      description,
      duration: Infinity, // waits for an answer
      action: { label: confirmLabel, onClick: () => answer(true) },
      cancel: { label: cancelLabel, onClick: () => answer(false) },
      onDismiss: () => answer(false),
      onAutoClose: () => answer(false),
      classNames: destructive ? { actionButton: "!bg-destructive !text-white" } : undefined,
    });
  });
}
