import { afterEach, describe, expect, it } from "vitest";
import { FocusEngine, pickInDirection, type Rect } from "@/v1/tv/focus";

// jsdom has no layout: every focusable gets its rect from data-rect="left,top,width,height".
const rectOf = (el: HTMLElement): Rect => {
  const [l, t, w, h] = (el.getAttribute("data-rect") ?? "0,0,0,0").split(",").map(Number) as [
    number,
    number,
    number,
    number,
  ];
  return { left: l, top: t, right: l + w, bottom: t + h };
};

function mount(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  const engine = new FocusEngine(root, { rectOf, isVisible: () => true, scroll: false });
  return { root, engine };
}

const btn = (id: string, rect: string, extra = "") =>
  `<button data-focus data-focus-id="${id}" data-rect="${rect}" ${extra}>${id}</button>`;

/** wait for MutationObserver callbacks */
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("pickInDirection (handoff §3 spatial rule)", () => {
  const from: Rect = { left: 100, top: 100, right: 200, bottom: 172 };
  it("prefers a candidate overlapping on the orthogonal axis over a closer diagonal one", () => {
    const sameRow: Rect = { left: 400, top: 110, right: 500, bottom: 182 };
    const diagonal: Rect = { left: 210, top: 300, right: 310, bottom: 372 };
    expect(pickInDirection(from, [diagonal, sameRow], "right")).toBe(1);
  });
  it("takes the nearest when nothing overlaps", () => {
    const far: Rect = { left: 600, top: 400, right: 700, bottom: 472 };
    const near: Rect = { left: 260, top: 250, right: 360, bottom: 322 };
    expect(pickInDirection(from, [far, near], "right")).toBe(1);
  });
  it("ignores candidates behind the pressed direction", () => {
    const left: Rect = { left: 0, top: 100, right: 80, bottom: 172 };
    expect(pickInDirection(from, [left], "right")).toBe(-1);
    expect(pickInDirection(from, [left], "left")).toBe(0);
  });
  it("breaks exact ties by DOM order (deterministic)", () => {
    const a: Rect = { left: 100, top: 300, right: 200, bottom: 372 };
    const b: Rect = { left: 100, top: 300, right: 200, bottom: 372 };
    expect(pickInDirection(from, [a, b], "down")).toBe(0);
  });
});

describe("FocusEngine", () => {
  it("starts on data-autofocus and moves in a 2-D grid", () => {
    const { engine } = mount(
      `<div data-screen="grid">
        ${btn("a", "0,0,100,72")}${btn("b", "120,0,100,72", "data-autofocus")}
        ${btn("c", "0,100,100,72")}${btn("d", "120,100,100,72")}
      </div>`,
    );
    engine.sync();
    expect(engine.focusedId()).toBe("b");
    engine.move("down");
    expect(engine.focusedId()).toBe("d");
    engine.move("left");
    expect(engine.focusedId()).toBe("c");
    engine.move("up");
    expect(engine.focusedId()).toBe("a");
    // nothing above: focus stays
    expect(engine.move("up")).toBe(false);
    expect(engine.focusedId()).toBe("a");
  });

  it("skips disabled focusables", () => {
    const { engine } = mount(
      `<div data-screen="s">${btn("a", "0,0,100,72", "data-autofocus")}${btn("b", "120,0,100,72", "disabled")}${btn("c", "240,0,100,72")}</div>`,
    );
    engine.sync();
    engine.move("right");
    expect(engine.focusedId()).toBe("c");
  });

  it("traps focus in a modal and restores the previous element when it closes", async () => {
    const { root, engine } = mount(
      `<div data-screen="dash">${btn("complete", "0,900,200,100", "data-autofocus")}${btn("end", "300,900,200,100")}</div>`,
    );
    engine.attach();
    engine.move("right");
    expect(engine.focusedId()).toBe("end");

    const modal = document.createElement("div");
    modal.setAttribute("data-modal", "end");
    modal.innerHTML =
      btn("keep-going", "600,500,200,100", "data-autofocus") +
      btn("end-and-save", "820,500,200,100");
    root.appendChild(modal);
    await flush();
    expect(engine.focusedId()).toBe("keep-going");
    // Only modal candidates are reachable.
    expect(engine.candidates().map((e) => e.getAttribute("data-focus-id"))).toEqual([
      "keep-going",
      "end-and-save",
    ]);
    engine.move("left");
    expect(engine.focusedId()).toBe("keep-going");
    engine.move("right");
    expect(engine.focusedId()).toBe("end-and-save");

    modal.remove();
    await flush();
    expect(engine.focusedId()).toBe("end");
    engine.detach();
  });

  it("nested modals pop back to the element focused when each opened", async () => {
    const { root, engine } = mount(
      `<div data-screen="dash">${btn("pause", "0,0,100,72", "data-autofocus")}</div>`,
    );
    engine.attach();
    const paused = document.createElement("div");
    paused.setAttribute("data-modal", "paused");
    paused.innerHTML =
      btn("resume", "0,500,100,72", "data-autofocus") + btn("paused-end", "120,500,100,72");
    root.appendChild(paused);
    await flush();
    engine.move("right");
    expect(engine.focusedId()).toBe("paused-end");
    const m3 = document.createElement("div");
    m3.setAttribute("data-modal", "end");
    m3.innerHTML = btn("keep-going", "0,800,100,72", "data-autofocus");
    root.appendChild(m3);
    await flush();
    expect(engine.focusedId()).toBe("keep-going");
    m3.remove();
    await flush();
    expect(engine.focusedId()).toBe("paused-end");
    paused.remove();
    await flush();
    expect(engine.focusedId()).toBe("pause");
    engine.detach();
  });

  it("keeps the same data-focus-id across a re-render", async () => {
    const { root, engine } = mount(
      `<div data-screen="home">${btn("x", "0,0,100,72", "data-autofocus")}${btn("y", "0,100,100,72")}</div>`,
    );
    engine.attach();
    engine.move("down");
    expect(engine.focusedId()).toBe("y");
    // re-render: new nodes, same ids
    (root.firstElementChild as HTMLElement).innerHTML =
      btn("x", "0,0,100,72", "data-autofocus") + btn("y", "0,100,100,72");
    await flush();
    expect(engine.focusedId()).toBe("y");
    expect(engine.focused?.isConnected).toBe(true);
    engine.detach();
  });

  it("a new screen gets its initial focus even when an id repeats", async () => {
    const { root, engine } = mount(
      `<div data-screen="home">${btn("nav-program", "0,0,100,72")}${btn("workout-now", "0,100,100,72", "data-autofocus")}</div>`,
    );
    engine.attach();
    engine.move("up");
    expect(engine.focusedId()).toBe("nav-program");
    root.innerHTML = `<div data-screen="program">${btn("nav-program", "0,0,100,72")}${btn("row-1", "0,100,100,72", "data-autofocus")}</div>`;
    await flush();
    expect(engine.focusedId()).toBe("row-1");
    engine.detach();
  });

  it("remembers the last row per list and restores it when the screen returns", async () => {
    const list = (auto: string) =>
      `<div data-screen="program"><ul data-focus-list="program">
        ${btn("r1", "0,0,100,72", auto === "r1" ? "data-autofocus" : "")}
        ${btn("r2", "0,100,100,72")}${btn("r3", "0,200,100,72")}
      </ul></div>`;
    const { root, engine } = mount(list("r1"));
    engine.attach();
    engine.move("down");
    engine.move("down");
    expect(engine.focusedId()).toBe("r3");
    root.innerHTML = `<div data-screen="home">${btn("h", "0,0,100,72", "data-autofocus")}</div>`;
    await flush();
    expect(engine.focusedId()).toBe("h");
    root.innerHTML = list("r1");
    await flush();
    expect(engine.focusedId()).toBe("r3");
    engine.detach();
  });

  it('data-autofocus="force" (Calendar opened on a given day) beats the remembered row', async () => {
    const days = (sel: string, force: boolean) =>
      `<div data-screen="calendar"><div data-focus-list="calendar-days">
        ${["d28", "d29", "d31"]
          .map((d, i) =>
            btn(
              d,
              `${i * 120},0,100,72`,
              d === sel ? `data-autofocus="${force ? "force" : ""}"` : "",
            ),
          )
          .join("")}
      </div></div>`;
    const { root, engine } = mount(days("d31", false));
    engine.attach();
    expect(engine.focusedId()).toBe("d31"); // remembered from here on
    root.innerHTML = `<div data-screen="home">${btn("h", "0,0,100,72", "data-autofocus")}</div>`;
    await flush();
    root.innerHTML = days("d28", true); // Back from the Oct 28 session
    await flush();
    expect(engine.focusedId()).toBe("d28");
    engine.detach();
  });

  it("follows a changed data-autofocus (rest started) until the user moves", async () => {
    const { root, engine } = mount(
      `<div data-screen="dash">${btn("skip-rest", "0,0,100,72")}${btn("complete", "0,100,100,72", "data-autofocus")}${btn("pause", "120,100,100,72")}</div>`,
    );
    engine.attach();
    expect(engine.focusedId()).toBe("complete");
    const [skip, complete] = [...root.querySelectorAll("button")] as HTMLElement[];
    complete?.removeAttribute("data-autofocus");
    skip?.setAttribute("data-autofocus", "");
    await flush();
    expect(engine.focusedId()).toBe("skip-rest");
    // the user moves away; a later autofocus change does not steal focus
    engine.move("down");
    expect(engine.focusedId()).toBe("complete");
    skip?.removeAttribute("data-autofocus");
    complete?.setAttribute("data-autofocus", "");
    await flush();
    engine.move("right");
    expect(engine.focusedId()).toBe("pause");
    complete?.removeAttribute("data-autofocus");
    skip?.setAttribute("data-autofocus", "");
    await flush();
    expect(engine.focusedId()).toBe("pause");
    engine.detach();
  });

  it("Enter activates the focused element", () => {
    const { root, engine } = mount(
      `<div data-screen="s">${btn("a", "0,0,100,72", "data-autofocus")}</div>`,
    );
    let clicks = 0;
    root.querySelector("button")?.addEventListener("click", () => clicks++);
    engine.sync();
    engine.activate();
    expect(clicks).toBe(1);
  });
});
