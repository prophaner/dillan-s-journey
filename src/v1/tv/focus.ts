// D-pad focus engine for the TV surface (port of design/v1/prototype/js/dpad.js, rules from
// design/v1/docs/05-developer-handoff.md §3). Framework-free so it can be unit tested in jsdom.
//
//  - Focusables: [data-focus] elements that are visible and not disabled.
//  - Spatial navigation: from the focused rect, candidates must lie in the pressed direction.
//    Candidates that overlap the focused rect on the orthogonal axis (≥1 px) win over those that
//    don't; among them the lowest (primary gap × 1) + (orthogonal penalty × 2) wins, then the
//    smaller centre offset, then DOM order (deterministic). With no overlapping candidate the
//    nearest by the same score is taken.
//  - [data-screen="<key>"] names the screen; a new key gets initial focus (not the same id).
//  - A modal ([data-modal]) restricts candidates to itself; when it closes, focus returns to the
//    element that had it before the modal opened (same data-focus-id), if it still exists.
//  - Initial focus per screen: [data-autofocus]. After a re-render focus stays on the element with
//    the same data-focus-id; else the list memory; else data-autofocus; else the first candidate.
//  - Per-list memory: inside [data-focus-list="<id>"] the last focused data-focus-id is kept, so
//    returning to Program/Choose restores the row. [data-autofocus="force"] marks an explicit
//    selection (Calendar opened on a given day) and wins over the list memory.
//  - data-focus-up/down/left/right="<focus-id>" routes that direction explicitly (S09 focus order).

export type Direction = "up" | "down" | "left" | "right";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface FocusEngineOptions {
  /** geometry (tests pass fixed rects; jsdom has no layout) */
  rectOf?: (el: HTMLElement) => Rect;
  /** visibility (default: has layout boxes and is not inside [hidden]/[inert]) */
  isVisible?: (el: HTMLElement) => boolean;
  /** called after focus moves (the app counts it as activity) */
  onFocus?: (el: HTMLElement | null) => void;
  /** scroll the focused element into view (default true; off in tests) */
  scroll?: boolean;
}

const SEL = "[data-focus]";
const EDGE_SLACK = 4;

function defaultRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function defaultVisible(el: HTMLElement): boolean {
  if (el.closest("[hidden],[inert]")) return false;
  return el.getClientRects().length > 0;
}

/** The pure direction/score rule, exported for tests. Returns the best index or -1. */
export function pickInDirection(from: Rect, cands: Rect[], dir: Direction): number {
  const fcx = (from.left + from.right) / 2;
  const fcy = (from.top + from.bottom) / 2;
  let best = -1;
  let bestKey: [number, number, number, number] | null = null;
  cands.forEach((c, i) => {
    const cx = (c.left + c.right) / 2;
    const cy = (c.top + c.bottom) / 2;
    let inDir: boolean;
    let gap: number;
    let orthGap: number;
    let orthCentre: number;
    if (dir === "right" || dir === "left") {
      inDir =
        dir === "right"
          ? c.left >= from.right - EDGE_SLACK || (cx > fcx && c.left > from.left)
          : c.right <= from.left + EDGE_SLACK || (cx < fcx && c.right < from.right);
      gap = Math.max(0, dir === "right" ? c.left - from.right : from.left - c.right);
      const overlap = Math.min(c.bottom, from.bottom) - Math.max(c.top, from.top);
      orthGap = overlap >= 1 ? 0 : Math.max(c.top - from.bottom, from.top - c.bottom, 0);
      orthCentre = Math.abs(cy - fcy);
    } else {
      inDir =
        dir === "down"
          ? c.top >= from.bottom - EDGE_SLACK || (cy > fcy && c.top > from.top)
          : c.bottom <= from.top + EDGE_SLACK || (cy < fcy && c.bottom < from.bottom);
      gap = Math.max(0, dir === "down" ? c.top - from.bottom : from.top - c.bottom);
      const overlap = Math.min(c.right, from.right) - Math.max(c.left, from.left);
      orthGap = overlap >= 1 ? 0 : Math.max(c.left - from.right, from.left - c.right, 0);
      orthCentre = Math.abs(cx - fcx);
    }
    if (!inDir) return;
    const overlapping = orthGap === 0 ? 0 : 1;
    const key: [number, number, number, number] = [overlapping, gap + orthGap * 2, orthCentre, i];
    if (!bestKey || lexLess(key, bestKey)) {
      bestKey = key;
      best = i;
    }
  });
  return best;
}

function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if ((a[i] as number) < (b[i] as number)) return true;
    if ((a[i] as number) > (b[i] as number)) return false;
  }
  return false;
}

export class FocusEngine {
  private current: HTMLElement | null = null;
  private listMemory = new Map<string, string>();
  private modalStack: Array<string | null> = [];
  private screen: string | null | undefined = undefined;
  private lastAuto: string | null = null;
  private movedSinceAuto = false;
  private observer: MutationObserver | null = null;
  private rectOf: (el: HTMLElement) => Rect;
  private isVisible: (el: HTMLElement) => boolean;

  constructor(
    private root: HTMLElement,
    private o: FocusEngineOptions = {},
  ) {
    this.rectOf = o.rectOf ?? defaultRect;
    this.isVisible = o.isVisible ?? defaultVisible;
  }

  /** Watch the DOM: re-render → keep or restore focus deterministically. */
  attach() {
    if (typeof MutationObserver === "undefined") return;
    this.observer = new MutationObserver(() => this.sync());
    this.observer.observe(this.root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "disabled",
        "data-modal",
        "hidden",
        "inert",
        "data-focus",
        "data-autofocus",
      ],
    });
    this.sync();
  }

  detach() {
    this.observer?.disconnect();
    this.observer = null;
  }

  get focused(): HTMLElement | null {
    return this.current;
  }

  focusedId(): string | null {
    return this.current?.getAttribute("data-focus-id") ?? null;
  }

  private scope(): HTMLElement {
    const modals = this.root.querySelectorAll<HTMLElement>("[data-modal]");
    return modals.length ? (modals[modals.length - 1] as HTMLElement) : this.root;
  }

  candidates(): HTMLElement[] {
    return [...this.scope().querySelectorAll<HTMLElement>(SEL)].filter(
      (el) =>
        !el.hasAttribute("disabled") &&
        // data-focus-keep: aria-disabled but still focusable (TvButton softDisabled)
        (el.getAttribute("aria-disabled") !== "true" || el.hasAttribute("data-focus-keep")) &&
        this.isVisible(el),
    );
  }

  setFocus(el: HTMLElement | null, opts: { scroll?: boolean } = {}) {
    if (this.current && this.current !== el) {
      this.current.classList.remove("is-focused");
      this.current.removeAttribute("data-focused");
    }
    this.current = el;
    if (el) {
      el.classList.add("is-focused");
      el.setAttribute("data-focused", "");
      const list = el.closest<HTMLElement>("[data-focus-list]");
      const id = el.getAttribute("data-focus-id");
      if (list && id) this.listMemory.set(list.getAttribute("data-focus-list") as string, id);
      if (typeof el.focus === "function") el.focus({ preventScroll: true });
      if ((opts.scroll ?? this.o.scroll ?? true) && typeof el.scrollIntoView === "function")
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    this.o.onFocus?.(el);
  }

  move(dir: Direction): boolean {
    const list = this.candidates();
    if (!list.length) return false;
    if (!this.current || !list.includes(this.current)) {
      this.initial();
      return true;
    }
    // An explicit route wins over geometry (data-focus-down="pause": S09 Heart rate → Pause).
    const routed = this.current.getAttribute(`data-focus-${dir}`);
    if (routed) {
      const target = list.find((el) => el.getAttribute("data-focus-id") === routed);
      if (target) {
        this.movedSinceAuto = true;
        this.setFocus(target);
        return true;
      }
    }
    const from = this.rectOf(this.current);
    const others = list.filter((el) => el !== this.current);
    const i = pickInDirection(
      from,
      others.map((el) => this.rectOf(el)),
      dir,
    );
    if (i < 0) return false;
    this.movedSinceAuto = true;
    this.setFocus(others[i] as HTMLElement);
    return true;
  }

  /** Initial focus for the current scope: list memory → data-autofocus → first. */
  initial() {
    const list = this.candidates();
    if (!list.length) {
      this.setFocus(null);
      return;
    }
    const auto = list.find((el) => el.hasAttribute("data-autofocus"));
    const remembered =
      auto?.getAttribute("data-autofocus") === "force"
        ? null
        : this.rememberedIn(list, auto ?? null);
    this.setFocus(remembered ?? auto ?? (list[0] as HTMLElement), { scroll: false });
  }

  /** A list remembers its row only when the screen's initial focus would land in that list. */
  private rememberedIn(list: HTMLElement[], auto: HTMLElement | null): HTMLElement | null {
    const listEl = auto?.closest<HTMLElement>("[data-focus-list]");
    if (!listEl) return null;
    const id = this.listMemory.get(listEl.getAttribute("data-focus-list") as string);
    if (!id) return null;
    return list.find((el) => el.getAttribute("data-focus-id") === id) ?? null;
  }

  /** Keep the same logical element after a re-render, else fall back deterministically. */
  restore(prevId: string | null) {
    const list = this.candidates();
    if (prevId) {
      const same = list.find((el) => el.getAttribute("data-focus-id") === prevId);
      if (same) {
        this.setFocus(same, { scroll: false });
        return;
      }
    }
    this.initial();
  }

  /** Forget a list's remembered row (e.g. the remembered workout was deleted). */
  forgetList(id: string) {
    this.listMemory.delete(id);
  }

  /**
   * Called on DOM changes:
   *  - a new screen ([data-screen] value changed) → initial focus
   *  - a modal opened on top → remember the focus id, initial focus inside the modal
   *  - a modal closed → back to the id focused when it opened
   *  - the screen's data-autofocus target changed (data loaded, rest started) and the user has
   *    not moved since → follow it
   *  - the focused element disappeared → same id, else initial
   */
  sync() {
    const screen = this.root.querySelector("[data-screen]")?.getAttribute("data-screen") ?? null;
    const modals = this.root.querySelectorAll("[data-modal]").length;
    const autoId = this.autoId();
    if (screen !== this.screen) {
      this.screen = screen;
      this.modalStack = new Array<string | null>(modals).fill(null);
      this.lastAuto = autoId;
      this.movedSinceAuto = false;
      this.initial();
      return;
    }
    if (modals > this.modalStack.length) {
      while (this.modalStack.length < modals) this.modalStack.push(this.focusedId());
      this.lastAuto = autoId;
      this.movedSinceAuto = false;
      this.initial();
      return;
    }
    if (modals < this.modalStack.length) {
      let back: string | null = null;
      while (this.modalStack.length > modals) back = this.modalStack.pop() ?? null;
      this.lastAuto = autoId;
      this.restore(back);
      return;
    }
    if (autoId !== this.lastAuto) {
      this.lastAuto = autoId;
      if (!this.movedSinceAuto && autoId) {
        this.initial();
        return;
      }
      this.movedSinceAuto = false;
    }
    const list = this.candidates();
    if (this.current && list.includes(this.current) && this.root.contains(this.current)) return;
    this.restore(this.current?.getAttribute("data-focus-id") ?? null);
  }

  private autoId(): string | null {
    const auto = this.candidates().find((el) => el.hasAttribute("data-autofocus"));
    return auto ? (auto.getAttribute("data-focus-id") ?? "auto") : null;
  }

  /** Enter: activate the focused element. */
  activate(): boolean {
    if (!this.current) return false;
    this.current.click();
    return true;
  }
}
