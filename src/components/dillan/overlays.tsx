import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { X, Download, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DButton } from "./button";
import { Banner } from "./surfaces";

/** Sheet on a native <dialog>: focus is trapped by the browser. Bottom sheet on phone, side sheet from md. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={cn(
        "m-0 mt-auto w-full max-w-none bg-surface p-0 text-text shadow-float",
        "rounded-t-sheet md:ml-auto md:mt-0 md:h-dvh md:max-h-none md:w-[420px] md:rounded-none md:rounded-l-sheet",
      )}
    >
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <h2 className="text-title3 font-bold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="press grid size-11 place-items-center rounded-full bg-surface-2">
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="px-5 pb-[calc(var(--safe-b)+24px)]">{children}</div>
    </dialog>
  );
}

interface ToastMsg {
  id: number;
  text: string;
  undo?: () => void;
}
const ToastCtx = createContext<(t: Omit<ToastMsg, "id">) => void>(() => {});

/** Toast with undo: 6s, floating above nav and sticky actions. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const push = useCallback((t: Omit<ToastMsg, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 6000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-h)+var(--safe-b)+12px)] z-50 flex flex-col items-center gap-2 px-margin lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="animate-settle pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-btn bg-text px-4 py-3 text-bg shadow-float">
            <span className="flex-1 text-subhead">{t.text}</span>
            {t.undo && (
              <button
                type="button"
                className="h-11 px-2 text-subhead font-bold underline"
                onClick={() => {
                  t.undo?.();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Tracks the on-screen keyboard via visualViewport so sticky actions stay above it. */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

export function StickyActions({ children, className }: { children: ReactNode; className?: string }) {
  const kb = useKeyboardInset();
  return (
    <div
      className={cn("sticky z-30 -mx-margin bg-bg/95 px-margin pt-3 backdrop-blur", className)}
      style={{ bottom: kb, paddingBottom: kb > 0 ? 8 : "calc(var(--safe-b) + 12px)" }}
    >
      {children}
    </div>
  );
}

export function InstallPrompt({ onInstall, onLater }: { onInstall: () => void; onLater: () => void }) {
  return (
    <Banner
      icon={<Download className="size-5 shrink-0" aria-hidden />}
      action={
        <div className="flex gap-1">
          <DButton variant="quiet" size="sm" onClick={onLater}>Later</DButton>
          <DButton variant="secondary" size="sm" className="bg-surface" onClick={onInstall}>Add</DButton>
        </div>
      }
    >
      Add Dillan to your home screen for a full-screen view. Optional.
    </Banner>
  );
}

export function UpdateBanner({ onUpdate }: { onUpdate: () => void }) {
  return (
    <Banner
      icon={<RefreshCw className="size-5 shrink-0" aria-hidden />}
      action={<DButton variant="secondary" size="sm" className="bg-surface" onClick={onUpdate}>Update</DButton>}
    >
      A new version of Dillan is ready.
    </Banner>
  );
}
