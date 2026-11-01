/* D-pad spatial navigation for the TV surface.
   Focusable = any element with [data-focus] that is visible. A modal ([data-modal]) traps focus.
   Arrow keys move by geometry; Enter/Space activates; Backspace/Escape = TV Back. */
export function createDpad(root, { onBack }) {
  let current = null;
  function scope() { const modal = root.querySelector('[data-modal]'); return modal || root; }
  function candidates() { return [...scope().querySelectorAll('[data-focus]')].filter(el => el.offsetParent !== null && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true'); }
  function setFocus(el, { scroll = true } = {}) {
    if (current && current !== el) current.classList.remove('is-focused');
    current = el; if (!el) return;
    el.classList.add('is-focused');
    if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }
  function rect(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, t: r.top, b: r.bottom }; }
  function move(dir) {
    const list = candidates(); if (!list.length) return;
    if (!current || !list.includes(current)) { initial(); return; }
    const a = rect(current); let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === current) continue; const b = rect(el);
      let dx = b.x - a.x, dy = b.y - a.y; let primary, secondary, ok;
      if (dir === 'ArrowRight') { ok = b.l >= a.r - 4 || (b.x > a.x && b.l > a.l); primary = dx; secondary = dy; }
      if (dir === 'ArrowLeft') { ok = b.r <= a.l + 4 || (b.x < a.x && b.r < a.r); primary = -dx; secondary = dy; }
      if (dir === 'ArrowDown') { ok = b.t >= a.b - 4 || (b.y > a.y && b.t > a.t); primary = dy; secondary = dx; }
      if (dir === 'ArrowUp') { ok = b.b <= a.t + 4 || (b.y < a.y && b.b < a.b); primary = -dy; secondary = dx; }
      if (!ok || primary <= 0) continue;
      // Favor alignment on the cross axis; penalize off-axis distance strongly.
      const score = primary + Math.abs(secondary) * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) setFocus(best);
  }
  function initial() {
    const list = candidates(); if (!list.length) { setFocus(null); return; }
    const auto = list.find(el => el.hasAttribute('data-autofocus'));
    setFocus(auto || list[0], { scroll: false });
  }
  /* After a re-render: keep focus on the same logical element when it still exists. */
  function restore(prevId) {
    const list = candidates();
    if (prevId) { const same = list.find(el => el.getAttribute('data-fid') === prevId); if (same) { setFocus(same, { scroll: false }); return; } }
    initial();
  }
  function onKey(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); move(e.key); return true; }
    if (e.key === 'Enter' || e.key === ' ') { if (current) { e.preventDefault(); current.click(); } return true; }
    if (e.key === 'Backspace' || e.key === 'Escape' || e.key === 'GoBack') { e.preventDefault(); onBack(); return true; }
    return false;
  }
  return { onKey, restore, initial, get current() { return current; }, setFocus };
}
