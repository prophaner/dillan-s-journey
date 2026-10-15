import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/timer";

/** Big rounded numeral with 56px steppers. Tap the number to type (text + inputmode, never type=number). */
export function NumericInput({
  value,
  onChange,
  step = 1,
  min = 0,
  unit,
  label,
  last,
  decimal = false,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  unit?: string;
  label: string;
  last?: number | null;
  decimal?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  const commit = () => {
    const n = Number(draft.replace(",", "."));
    if (!Number.isNaN(n) && n >= min) onChange(n);
    setEditing(false);
  };
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
        className="press grid size-14 shrink-0 place-items-center rounded-full bg-surface-2"
      >
        <Minus className="size-6" aria-hidden />
      </button>
      <div className="min-w-0 flex-1 text-center">
        {editing ? (
          <input
            ref={ref}
            aria-label={label}
            inputMode={decimal ? "decimal" : "numeric"}
            enterKeyHint="done"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className="w-full rounded-btn border-2 border-text bg-surface py-2 text-center font-num text-[26px] font-extrabold tabular"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(String(value));
              setEditing(true);
            }}
            className="font-num text-num-l font-extrabold leading-none tabular"
            aria-label={`${label}: ${value}${unit ? " " + unit : ""}. Tap to type.`}
          >
            {value}
            {unit && <span className="ml-1 text-title2 font-bold">{unit}</span>}
          </button>
        )}
        <p className="mt-2 text-footnote font-bold uppercase tracking-wide text-text-2">
          {label}
          {last !== undefined && (
            <span className="normal-case tracking-normal"> · last time {last === null ? "—" : last}</span>
          )}
        </p>
      </div>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(+(value + step).toFixed(2))}
        className="press grid size-14 shrink-0 place-items-center rounded-full bg-surface-2"
      >
        <Plus className="size-6" aria-hidden />
      </button>
    </div>
  );
}

export function SetPips({ total, done, current, onSelect }: { total: number; done: number[]; current: number; onSelect?: (i: number) => void }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const isDone = done.includes(n);
        const isCur = n === current;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onSelect?.(n)}
            aria-label={`Set ${n}${isDone ? ", done" : isCur ? ", current" : ""}`}
            className={cn(
              "press grid h-[52px] place-items-center rounded-btn font-num text-headline font-bold",
              isDone && "bg-steady-tint text-steady",
              isCur && !isDone && "border-2 border-text bg-surface text-text",
              !isDone && !isCur && "bg-surface-2 text-text-2",
            )}
          >
            {isDone ? <Check className="size-5" aria-hidden /> : n}
          </button>
        );
      })}
    </div>
  );
}

/** Rest timer drawn as the logo: cradle ring fills, the Spot sits on top. */
export function RestTimer({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  const r = 120;
  const c = 2 * Math.PI * r;
  const frac = totalMs > 0 ? remainingMs / totalMs : 0;
  return (
    <div className="relative mx-auto grid aspect-square w-full max-w-[300px] place-items-center" role="timer" aria-live="off" aria-label={`Rest, ${formatClock(remainingMs)} left`}>
      <svg viewBox="0 0 280 280" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="140" cy="140" r={r} fill="none" className="stroke-surface-2" strokeWidth="14" />
        <circle
          cx="140"
          cy="140"
          r={r}
          fill="none"
          className="stroke-text transition-[stroke-dashoffset] duration-[var(--dur-base)]"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
        />
      </svg>
      <span className="absolute left-1/2 top-[6%] size-6 -translate-x-1/2 rounded-full bg-spot" aria-hidden />
      <span className="font-num text-num-xl font-extrabold tabular leading-none">{formatClock(remainingMs)}</span>
    </div>
  );
}
