// V1 form building blocks (design/v1/docs/04-design-system.md: Segmented, Field, Stepper).
// No native validation bubbles: errors are inline, tied with aria-describedby, in Hold.

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-12 w-full min-w-0 rounded-btn border border-line bg-surface px-4 text-callout text-text placeholder:text-text-3 aria-[invalid=true]:border-2 aria-[invalid=true]:border-hold";

export function Field({
  label,
  htmlFor,
  error,
  help,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  error?: string | null;
  help?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-subhead font-bold text-text-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-err`} className="text-footnote font-medium text-hold">
          {error}
        </p>
      ) : help ? (
        <p id={`${htmlFor}-help`} className="text-footnote text-text-2">
          {help}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput(
  { invalid, className, id, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={id ? (invalid ? `${id}-err` : `${id}-help`) : undefined}
      className={cn(inputClass, className)}
      {...rest}
    />
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function TextArea({ invalid, className, id, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={id ? (invalid ? `${id}-err` : `${id}-help`) : undefined}
      className={cn(inputClass, "h-auto min-h-20 py-3 leading-snug", className)}
      {...rest}
    />
  );
});

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  name,
}: {
  label: string;
  value: T | null;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  className?: string;
  name?: string;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      id={name}
      className={cn("grid min-w-0 gap-1 rounded-btn bg-surface-2 p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            id={`${id}-${o.value}`}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-11 min-w-0 rounded-[14px] px-2 text-subhead font-medium text-text-2",
              on && "bg-surface font-bold text-text shadow-float",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const btn = "grid size-11 place-items-center rounded-full text-text disabled:text-text-3";
  return (
    <div
      className="inline-flex items-center gap-1 rounded-btn border border-line bg-surface p-1"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className={btn}
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="size-5" aria-hidden />
      </button>
      <span
        className="min-w-8 text-center font-num text-title3 font-bold tabular"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        className={btn}
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="size-5" aria-hidden />
      </button>
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-footnote font-bold uppercase tracking-wider text-text-2", className)}>
      {children}
    </p>
  );
}
