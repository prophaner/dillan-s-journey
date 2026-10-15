import type { ReactNode } from "react";
import { ChevronRight, Info, WifiOff, CircleAlert, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { SpotMark } from "./spot-mark";
import { DButton } from "./button";

export function Card({
  children,
  className,
  variant = "plain",
  as: As = "section",
}: {
  children: ReactNode;
  className?: string;
  variant?: "plain" | "proposal" | "guess";
  as?: "section" | "div" | "article";
}) {
  return (
    <As
      className={cn(
        "rounded-card bg-surface p-4 sm:p-[18px]",
        variant === "plain" && "border border-line",
        variant === "proposal" && "border-[1.5px] border-text",
        variant === "guess" && "border-[1.5px] border-dashed border-text-3",
        className,
      )}
    >
      {children}
    </As>
  );
}

/** Dillan speaking: Newsreader only here. */
export function VoiceBlock({
  headline,
  children,
  source,
  size = "xl",
  className,
}: {
  headline?: ReactNode;
  children?: ReactNode;
  source?: ReactNode;
  size?: "xl" | "body";
  className?: string;
}) {
  return (
    <div className={cn("font-voice", className)}>
      {headline && (
        <p className={cn("text-text", size === "xl" ? "text-voice-xl leading-[1.2] lg:text-[2.75rem]" : "text-voice leading-[1.38]")}>
          {headline}
        </p>
      )}
      {children && <p className="mt-2 text-voice leading-[1.38] text-text-2">{children}</p>}
      {source && (
        <p className="mt-3 flex items-center gap-1.5 font-ui text-footnote text-text-3">
          <SpotMark size={16} className="text-text" />
          {source}
        </p>
      )}
    </div>
  );
}

export function Banner({
  children,
  icon,
  action,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" className={cn("flex items-center gap-3 rounded-btn bg-surface-2 px-4 py-3 text-subhead", className)}>
      {icon ?? <Info className="size-5 shrink-0 text-text-2" aria-hidden />}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function OptionRow({
  icon,
  title,
  detail,
  onClick,
  trailing,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  onClick?: () => void;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("press flex w-full items-center gap-4 rounded-card border border-line bg-surface p-4 text-left", className)}
    >
      {icon && <span className="grid size-12 shrink-0 place-items-center rounded-btn bg-surface-2 text-text">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-title3 font-bold">{title}</span>
        {detail && <span className="mt-0.5 block text-subhead text-text-2">{detail}</span>}
      </span>
      {trailing ?? <ChevronRight className="size-5 shrink-0 text-text-2" aria-hidden />}
    </button>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-8 text-footnote font-bold uppercase tracking-wider text-text-2">{children}</h2>;
}

export type ScreenStateKind = "empty" | "loading" | "offline" | "failed";

/** Shared empty / loading / offline / failed-write states. */
export function ScreenState({
  kind,
  title,
  body,
  action,
}: {
  kind: ScreenStateKind;
  title?: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}) {
  const defaults: Record<ScreenStateKind, { icon: ReactNode; title: string; body: string }> = {
    empty: { icon: <Inbox className="size-6" aria-hidden />, title: "Nothing here yet", body: "This fills in as you train." },
    loading: { icon: <SpotMark size={28} animate className="text-text" />, title: "Loading", body: "One moment." },
    offline: {
      icon: <WifiOff className="size-6" aria-hidden />,
      title: "You're offline",
      body: "What you log is saved on this device and will sync when you're online and Dillan is open.",
    },
    failed: {
      icon: <CircleAlert className="size-6 text-hold" aria-hidden />,
      title: "That didn't save",
      body: "Nothing changed. Your last saved value is still shown.",
    },
  };
  const d = defaults[kind];
  return (
    <div role={kind === "loading" ? "status" : undefined} className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 grid size-14 place-items-center rounded-full bg-surface-2 text-text-2">{d.icon}</span>
      <p className="text-headline font-bold">{title ?? d.title}</p>
      <p className="mt-1 max-w-sm text-subhead text-text-2">{body ?? d.body}</p>
      {action && (
        <DButton size="md" className="mt-5" onClick={action.onClick}>
          {action.label}
        </DButton>
      )}
    </div>
  );
}

export function PageHeader({ title, eyebrow, trailing }: { title: string; eyebrow?: ReactNode; trailing?: ReactNode }) {
  return (
    <header className="pt-6 lg:pt-10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="text-footnote font-bold uppercase tracking-wider text-text-2">{eyebrow}</p>}
          <h1 className="mt-1 text-title1 font-bold leading-tight lg:text-[2.5rem]">{title}</h1>
        </div>
        {trailing}
      </div>
    </header>
  );
}
