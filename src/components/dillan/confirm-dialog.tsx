// Confirm dialogs (M1, M2, M4, M8...). Initial focus is always the safe action (handoff 3:
// "initial focus is never on Delete, Remove, End or a destructive confirm"); Escape = cancel;
// Tab stays inside; the destructive confirm is the second button.

import { useEffect, useId, useRef, type ReactNode } from "react";
import { DButton } from "./button";

export function ConfirmDialog({
  open,
  title,
  children,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  busy,
  confirmVariant = "danger",
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
  confirmVariant?: "primary" | "secondary" | "danger";
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const safe = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    safe.current?.focus();
    return () => {
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
    if (e.key === "Tab") {
      const els = box.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!els || els.length === 0) return;
      const first = els[0] as HTMLElement;
      const last = els[els.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-end bg-text/40 p-3 sm:place-items-center"
      onKeyDown={onKeyDown}
    >
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={children ? `${id}-d` : undefined}
        className="animate-settle w-full max-w-md rounded-card bg-surface p-5 shadow-float"
      >
        <h2 id={`${id}-t`} className="text-title3 font-bold">
          {title}
        </h2>
        {children && (
          <div id={`${id}-d`} className="mt-2 text-subhead text-text-2">
            {children}
          </div>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <DButton
            ref={safe}
            variant="secondary"
            size="md"
            className="w-full sm:flex-1"
            onClick={onCancel}
          >
            {cancelLabel}
          </DButton>
          <DButton
            variant={confirmVariant}
            size="md"
            className="w-full sm:flex-1"
            onClick={onConfirm}
            loading={!!busy}
            disabled={!!busy}
          >
            {confirmLabel}
          </DButton>
        </div>
      </div>
    </div>
  );
}
