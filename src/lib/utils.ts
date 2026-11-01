import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The type scale in src/styles.css (--text-*) uses custom names. Without them tailwind-merge reads
// e.g. "text-subhead" or "text-tv-base" as a text *color* and drops it when a color such as
// "text-z1" follows (or drops the color when the size follows).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "voice-xl",
        "voice",
        "title1",
        "title2",
        "title3",
        "headline",
        "body",
        "callout",
        "subhead",
        "footnote",
        "caption",
        "num-xl",
        "num-l",
        "num-m",
        "tv-xs",
        "tv-sm",
        "tv-base",
        "tv-md",
        "tv-lg",
        "tv-xl",
        "tv-2xl",
        "tv-3xl",
        "tv-metric",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
