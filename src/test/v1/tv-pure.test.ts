import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_LOCK_MS, AUTO_LOCK_TICK_MS, AUTO_LOCK_WARN_MS, AutoLock } from "@/v1/tv/autolock";
import {
  firstNameOf,
  forgetProfile,
  isRemembered,
  rememberProfile,
  rememberedProfiles,
  touchProfile,
  tvDevice,
} from "@/v1/tv/device";
import { tvKeyOf } from "@/v1/tv/keys";
import { BLANK_MIN_MS, runLock } from "@/v1/tv/lock";
import { encodeQr, formatBits, rsRemainder, versionBits } from "@/v1/tv/qr";
import { backFor, EXIT_TOAST, type TvScreen } from "@/v1/tv/screens";
import { SlidingWindowLimiter } from "@/v1/data/rate-limit";
import { isPlaceholderEmail, placeholderEmail } from "@/v1/core/placeholder-email";

describe("TV Back per screen (handoff §3)", () => {
  const go = (screen: TvScreen) => ({ kind: "go", screen });
  it("maps every screen", () => {
    expect(backFor({ name: "first_run" }, { modal: null })).toEqual({ kind: "exit" });
    expect(backFor({ name: "chooser" }, { modal: null })).toEqual({ kind: "exit" });
    expect(backFor({ name: "pairing", forUserId: null }, { modal: null })).toEqual({
      kind: "cancel_pairing",
    });
    expect(backFor({ name: "home" }, { modal: null })).toEqual({ kind: "exit_toast" });
    expect(backFor({ name: "home" }, { modal: null, liveSessionId: "s1" })).toEqual(
      go({ name: "session", sessionId: "s1" }),
    );
    for (const name of ["program", "choose", "calendar", "profile"] as const)
      expect(backFor({ name }, { modal: null })).toEqual(go({ name: "home" }));
    expect(backFor({ name: "preflight", templateId: "t" }, { modal: null })).toEqual(
      go({ name: "choose" }),
    );
    expect(backFor({ name: "detail", sessionId: "s", day: "2026-10-28" }, { modal: null })).toEqual(
      go({ name: "calendar", day: "2026-10-28", month: "2026-10" }),
    );
  });
  it("dashboard: active → Pause, paused → stays paused, ended (summary) → Calendar", () => {
    const s: TvScreen = { name: "session", sessionId: "s" };
    expect(backFor(s, { modal: null, sessionState: "active" })).toEqual({ kind: "pause" });
    expect(backFor(s, { modal: null, sessionState: "paused" })).toEqual({ kind: "noop" });
    expect(backFor(s, { modal: null, sessionState: "ended" })).toEqual(go({ name: "calendar" }));
  });
  it("a modal always closes first (M3 = Keep going, M4/M5/M6 = Cancel)", () => {
    for (const modal of [
      { kind: "end" },
      { kind: "running", then: "switch" },
      { kind: "lock" },
      { kind: "remove" },
      { kind: "zones" },
    ] as const)
      expect(
        backFor({ name: "session", sessionId: "s" }, { modal, sessionState: "active" }),
      ).toEqual({ kind: "close_modal" });
  });
  it("uses the canonical exit copy", () => {
    expect(EXIT_TOAST).toBe(
      "On Fire TV, Back here exits Dillan. You stay signed in and the TV auto-locks after 15 minutes.",
    );
  });
});

describe("remote key map", () => {
  it.each([
    [{ key: "ArrowUp", keyCode: 38 }, "up"],
    [{ key: "Enter", keyCode: 13 }, "select"],
    [{ key: "Escape", keyCode: 27 }, "back"],
    [{ key: "Backspace", keyCode: 8 }, "back"],
    [{ key: "GoBack", keyCode: 0 }, "back"],
    [{ key: "Unidentified", keyCode: 4 }, "back"],
    [{ key: "MediaPlayPause", keyCode: 179 }, "playpause"],
    [{ key: "Unidentified", keyCode: 179 }, "playpause"],
    [{ key: "ContextMenu", keyCode: 93 }, "menu"],
    [{ key: "Unidentified", keyCode: 82 }, "menu"],
    [{ key: "a", keyCode: 65 }, null],
  ])("%o → %s", (e, k) => {
    expect(tvKeyOf(e)).toBe(k);
  });
});

describe("auto-lock (15 min, toast at 14, 5 s tick)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(exempt = () => false) {
    const events: string[] = [];
    const a = new AutoLock({
      now: () => Date.now(),
      exempt,
      onWarn: () => events.push("warn"),
      onClearWarn: () => events.push("clear"),
      onLock: () => events.push("lock"),
    });
    a.start();
    return { a, events };
  }

  it("warns one minute before and locks at 15 minutes without activity", () => {
    const { events } = setup();
    vi.advanceTimersByTime(AUTO_LOCK_WARN_MS - AUTO_LOCK_TICK_MS);
    expect(events).toEqual([]);
    vi.advanceTimersByTime(AUTO_LOCK_TICK_MS);
    expect(events).toEqual(["warn"]);
    vi.advanceTimersByTime(AUTO_LOCK_MS - AUTO_LOCK_WARN_MS - AUTO_LOCK_TICK_MS);
    expect(events).toEqual(["warn"]);
    vi.advanceTimersByTime(AUTO_LOCK_TICK_MS);
    // the warning toast is cleared as the lock starts
    expect(events).toEqual(["warn", "clear", "lock"]);
    // stopped after locking
    vi.advanceTimersByTime(AUTO_LOCK_MS * 2);
    expect(events).toEqual(["warn", "clear", "lock"]);
  });

  it("any button press during the warning keeps the TV unlocked", () => {
    const { a, events } = setup();
    vi.advanceTimersByTime(AUTO_LOCK_WARN_MS);
    expect(events).toEqual(["warn"]);
    a.activity();
    expect(events).toEqual(["warn", "clear"]);
    vi.advanceTimersByTime(AUTO_LOCK_MS - AUTO_LOCK_TICK_MS);
    expect(events).toEqual(["warn", "clear", "warn"]);
  });

  it("never locks during an active or paused workout, and idle time there does not count", () => {
    let live = true;
    const { events } = setup(() => live);
    vi.advanceTimersByTime(AUTO_LOCK_MS * 3);
    expect(events).toEqual([]);
    live = false; // workout ended: the 15 minutes start now
    vi.advanceTimersByTime(AUTO_LOCK_MS - AUTO_LOCK_TICK_MS);
    expect(events).toEqual(["warn"]);
    vi.advanceTimersByTime(AUTO_LOCK_TICK_MS);
    expect(events).toEqual(["warn", "clear", "lock"]);
  });
});

describe("runLock", () => {
  it("blanks first, clears, signs out, keeps the blank ≥ BLANK_MIN_MS, then shows the chooser", async () => {
    let t = 0;
    const log: string[] = [];
    await runLock(
      {
        blank: () => log.push(`blank@${t}`),
        clearCaches: () => log.push(`clear@${t}`),
        signOut: async () => {
          t += 30;
          log.push(`signOut@${t}`);
        },
        forget: () => log.push("forget"),
        done: () => log.push(`done@${t}`),
      },
      {
        now: () => t,
        wait: async (ms) => {
          t += ms;
        },
      },
    );
    expect(log).toEqual(["blank@0", "clear@0", "signOut@30", "forget", `done@${BLANK_MIN_MS}`]);
    expect(BLANK_MIN_MS).toBeGreaterThanOrEqual(120);
  });
  it("still reaches the chooser when the network sign-out fails", async () => {
    const done = vi.fn();
    await runLock(
      {
        blank: () => undefined,
        clearCaches: () => undefined,
        signOut: () => Promise.reject(new Error("offline")),
        done,
      },
      { wait: async () => undefined },
    );
    expect(done).toHaveBeenCalledOnce();
  });
});

describe("TV device and remembered profiles (D17)", () => {
  const store = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  it("keeps one stable device id", () => {
    const s = store();
    const a = tvDevice(s);
    expect(a.id).toMatch(/^tv-[0-9a-f-]{36}$/);
    expect(tvDevice(s)).toEqual(a);
  });
  it("is opt-in, first names only, most recent first", () => {
    const s = store();
    expect(rememberedProfiles(s)).toEqual([]);
    touchProfile("u1", "Luis Ramos", 5, s); // touching never opts in
    expect(isRemembered("u1", s)).toBe(false);
    rememberProfile("u1", "Luis Ramos", 10, s);
    rememberProfile("u2", "Maya", 20, s);
    expect(rememberedProfiles(s)).toEqual([
      { userId: "u2", firstName: "Maya", lastActiveAt: 20 },
      { userId: "u1", firstName: "Luis", lastActiveAt: 10 },
    ]);
    touchProfile("u1", "Luis", 30, s);
    expect(rememberedProfiles(s)[0]?.userId).toBe("u1");
    forgetProfile("u1", s);
    expect(rememberedProfiles(s).map((p) => p.userId)).toEqual(["u2"]);
    expect(firstNameOf("  Ana María López ")).toBe("Ana");
  });
});

describe("QR encoder", () => {
  it("Reed–Solomon matches the published HELLO WORLD 1-M example", () => {
    expect(
      rsRemainder([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10),
    ).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });
  it("format and version information match the standard tables", () => {
    const m = ["101010000010010", "101000100100101", "101111001111100", "101101101001011"];
    m.forEach((bits, mask) => expect(formatBits(mask).toString(2).padStart(15, "0")).toBe(bits));
    expect(versionBits(7).toString(2).padStart(18, "0")).toBe("000111110010010100");
  });
  it("encodes the approve URL with finder patterns in three corners", () => {
    const q = encodeQr("https://dillan-s-journey.lovable.app/approve-tv?code=DLN-7K4M");
    expect(q.version).toBe(4);
    expect(q.size).toBe(33);
    const finder = (x0: number, y0: number) => {
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 7; x++) {
          const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
          expect(q.modules[y0 + y]?.[x0 + x]).toBe(d !== 2);
        }
    };
    finder(0, 0);
    finder(q.size - 7, 0);
    finder(0, q.size - 7);
    // dark module
    expect(q.modules[q.size - 8]?.[8]).toBe(true);
  });
  it("refuses text beyond version 10", () => {
    expect(() => encodeQr("x".repeat(400))).toThrow("qr_too_long");
  });
});

describe("pairing support", () => {
  it("per-IP sliding window", () => {
    const l = new SlidingWindowLimiter(2, 1000);
    expect(l.take("ip", 0)).toBe(true);
    expect(l.take("ip", 10)).toBe(true);
    expect(l.take("ip", 20)).toBe(false);
    expect(l.take("other", 20)).toBe(true);
    expect(l.take("ip", 1011)).toBe(true);
  });
  it("placeholder email for phone-only accounts is recognisable and never deliverable", () => {
    const e = placeholderEmail("00000000-0000-4000-8000-00000000a001");
    expect(e).toBe("tv+00000000-0000-4000-8000-00000000a001@users.dillan.invalid");
    expect(isPlaceholderEmail(e)).toBe(true);
    expect(isPlaceholderEmail("luis@example.com")).toBe(false);
  });
});

describe("TV canvas fit (handoff §2, review fix)", () => {
  it("every fr grid track on the TV is minmax(0,…): content never pushes a column off-canvas", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = "src/v1/tv";
    const bad = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .flatMap((f) =>
        [...readFileSync(`${dir}/${f}`, "utf8").matchAll(/grid-cols-\[([^\]]+)\]/g)]
          .filter((m) => /(^|_)[0-9.]+fr/.test(m[1] as string))
          .map((m) => `${f}: ${m[0]}`),
      );
    expect(bad).toEqual([]);
  });
});

describe("TV session marker and auto-lock across reloads (review fix)", () => {
  it("resumes the persisted idle clock instead of a fresh 15 minutes", () => {
    let t = 1_000_000;
    let locked = 0;
    const seen: number[] = [];
    const a = new AutoLock({
      now: () => t,
      exempt: () => false,
      onWarn: () => {},
      onClearWarn: () => {},
      onLock: () => locked++,
      onActivity: (at) => seen.push(at),
    });
    a.start(t - (AUTO_LOCK_MS - 1_000));
    t += 2_000;
    a.tick();
    expect(locked).toBe(1);
    a.stop();
    a.activity();
    expect(seen).toEqual([t]);
  });

  it("markerIdleExpired / isTvSessionFor", async () => {
    const { markerIdleExpired, isTvSessionFor, TV_SESSION_KEY } = await import("@/v1/tv/marker");
    expect(markerIdleExpired({ userId: "u", grantId: null }, 1e12)).toBe(false);
    expect(
      markerIdleExpired({ userId: "u", grantId: null, lastActiveAt: 0 }, AUTO_LOCK_MS - 1),
    ).toBe(false);
    expect(markerIdleExpired({ userId: "u", grantId: null, lastActiveAt: 0 }, AUTO_LOCK_MS)).toBe(
      true,
    );
    localStorage.setItem(TV_SESSION_KEY, JSON.stringify({ userId: "u1", grantId: "g" }));
    expect(isTvSessionFor("u1")).toBe(true);
    expect(isTvSessionFor("u2")).toBe(false);
    localStorage.removeItem(TV_SESSION_KEY);
    expect(isTvSessionFor("u1")).toBe(false);
  });
});

describe("S13 detail overflow line (review fix)", () => {
  it("counts the exercise rows that end below the clipped list", async () => {
    const { hiddenRowCount, TV_PROFILE_COPY } = await import("@/v1/tv/screens-history");
    const rows = [0, 130, 260, 390, 520].map((top) => ({ top, height: 118 }));
    expect(hiddenRowCount(400, rows)).toBe(2);
    expect(hiddenRowCount(700, rows)).toBe(0);
    expect(hiddenRowCount(0, rows)).toBe(0); // not laid out yet
    expect(TV_PROFILE_COPY.moreExercises(1)).toMatch(/^\+1 more exercise · /);
    expect(TV_PROFILE_COPY.moreExercises(3)).toMatch(/^\+3 more exercises · /);
  });
});
