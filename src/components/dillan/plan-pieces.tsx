import { cn } from "@/lib/utils";
import type { BlockKind, PipKind, TimeChoice } from "@/lib/demo";
import { StatusTag } from "./tags";

const choices: { id: TimeChoice; label: string }[] = [
  { id: "full", label: "Full" },
  { id: "short", label: "Short" },
  { id: "priority", label: "Priority only" },
];

/** Signature: Full · Short · Priority only, with estimated minutes. */
export function TimeControl({
  value,
  onChange,
  minutes,
}: {
  value: TimeChoice;
  onChange: (v: TimeChoice) => void;
  minutes: Record<TimeChoice, number>;
}) {
  return (
    <div role="radiogroup" aria-label="How much time do you have" className="grid grid-cols-3 gap-1 rounded-btn bg-surface-2 p-1">
      {choices.map((c) => {
        const on = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(c.id)}
            className={cn(
              "press flex min-h-14 flex-col items-center justify-center rounded-[14px] px-1 py-2 transition-colors duration-[var(--dur-quick)]",
              on ? "bg-surface text-text shadow-float" : "text-text-2",
            )}
          >
            <span className="font-num text-title2 font-extrabold tabular leading-none">{minutes[c.id]}</span>
            <span className="mt-1 text-footnote font-bold leading-tight sm:text-subhead">{c.label}</span>
            <span className="sr-only"> minutes</span>
          </button>
        );
      })}
    </div>
  );
}

export function BlockDot({ kind }: { kind: BlockKind }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-1.5 inline-block size-3 shrink-0 rounded-full",
        kind === "required" && "bg-text",
        kind === "priority" && "bg-spot",
        kind === "optional" && "border-2 border-text-2",
      )}
    />
  );
}

export function BlockRow({
  name,
  kind,
  exercises,
  minutes,
  tag,
  omitted,
}: {
  name: string;
  kind: BlockKind;
  exercises: string;
  minutes: number;
  tag?: string;
  omitted?: boolean;
}) {
  const kindWord = kind === "required" ? "required" : kind === "priority" ? "priority" : "optional";
  return (
    <li className={cn("flex gap-4 border-b border-line py-4 last:border-b-0", omitted && "text-text-3")}>
      <BlockDot kind={kind} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-headline font-bold", omitted && "line-through")}>{name}</span>
          <span className="sr-only">({kindWord}{omitted ? ", left out today" : ""})</span>
          {tag && !omitted && <StatusTag kind="priority" icon={false}>{tag}</StatusTag>}
        </div>
        <p className={cn("mt-0.5 text-subhead", omitted ? "line-through" : "text-text-2")}>{exercises}</p>
      </div>
      <span className="font-num text-subhead tabular text-text-2">{minutes} min</span>
    </li>
  );
}

const pipLabel: Record<PipKind, string> = {
  done: "done",
  short: "shortened",
  rest: "rest",
  planned: "planned",
  missed: "not done",
  today: "today",
};

function Pip({ kind }: { kind: PipKind }) {
  const base = "relative grid size-10 place-items-center rounded-full";
  switch (kind) {
    case "done":
      return <span className={cn(base, "bg-text")} />;
    case "short":
      return (
        <span className={cn(base, "overflow-hidden border-[3px] border-text")}>
          <span className="absolute inset-y-0 left-0 w-1/2 bg-text" />
        </span>
      );
    case "rest":
      return (
        <span className={cn(base, "border-[2.5px] border-text-2")}>
          <span className="size-2 rounded-full bg-text-2" />
        </span>
      );
    case "planned":
      return <span className={cn(base, "border-2 border-line")} />;
    case "missed":
      return <span className={cn(base, "border-2 border-dashed border-unknown")} />;
    case "today":
      return (
        <span className={cn(base, "border-[3px] border-spot ring-[6px] ring-spot-tint")}>
          <span className="size-4 rounded-full bg-spot" />
        </span>
      );
  }
}

/** Signature: the Course week strip. Shapes carry meaning, not color. */
export function CourseStrip({ days }: { days: { day: string; kind: PipKind }[] }) {
  return (
    <ol className="grid grid-cols-7 gap-1" aria-label="This week">
      {days.map((d, i) => (
        <li key={i} className="flex flex-col items-center gap-2">
          <span className={cn("text-footnote font-bold", d.kind === "today" ? "text-spot-ink" : "text-text-2")}>{d.day}</span>
          <Pip kind={d.kind} />
          <span className="sr-only">{pipLabel[d.kind]}</span>
        </li>
      ))}
    </ol>
  );
}
