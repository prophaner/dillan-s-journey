// 6-digit code entry (handoff 4.1): one real <input inputmode="numeric" autocomplete="one-time-code"
// maxlength="6"> laid over six display boxes, so paste, iOS/Android autofill and screen readers work.
// Clicking a box focuses the input; the sixth digit calls onComplete.

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const CodeInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    onComplete: (v: string) => void;
    invalid?: boolean;
    disabled?: boolean;
    describedBy?: string;
  }
>(function CodeInput({ value, onChange, onComplete, invalid, disabled, describedBy }, ref) {
  const digits = value.padEnd(6, " ").split("");
  return (
    <div className="relative">
      <div className="grid grid-cols-6 gap-2 max-[340px]:gap-1.5" aria-hidden>
        {digits.map((d, i) => (
          <span
            key={i}
            data-testid="code-box"
            className={cn(
              "grid h-14 min-w-0 place-items-center rounded-btn border border-line bg-surface font-num text-title2 font-bold tabular max-[340px]:h-10",
              i === Math.min(value.length, 5) && !disabled && "border-[3px] border-text",
              invalid && "border-hold",
            )}
          >
            {d.trim()}
          </span>
        ))}
      </div>
      <input
        ref={ref}
        id="otp"
        aria-label="6-digit code"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]*"
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 6);
          onChange(v);
          if (v.length === 6) onComplete(v);
        }}
        className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none"
      />
    </div>
  );
});
