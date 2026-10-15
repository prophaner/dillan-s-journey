import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const dButton = cva(
  "press inline-flex items-center justify-center gap-2 font-ui font-bold select-none disabled:pointer-events-none",
  {
    variants: {
      variant: {
        /** One per screen. Iron text on Spot, never white. */
        primary: "bg-spot text-on-accent active:bg-spot-press disabled:bg-surface-2 disabled:text-text-3",
        secondary: "bg-surface-2 text-text",
        quiet: "bg-transparent text-text-2 font-medium",
        outline: "bg-surface text-text border border-line font-medium",
      },
      size: {
        lg: "h-[58px] w-full rounded-btn px-6 text-headline",
        log: "h-16 w-full rounded-btn px-6 text-title3",
        md: "h-11 rounded-btn px-5 text-subhead",
        sm: "h-9 rounded-chip px-4 text-footnote",
      },
    },
    defaultVariants: { variant: "secondary", size: "lg" },
  },
);

export interface DButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof dButton> {
  icon?: ReactNode;
  loading?: boolean;
}

export const DButton = forwardRef<HTMLButtonElement, DButtonProps>(function DButton(
  { className, variant, size, icon, loading, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(dButton({ variant, size }), className)} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});
