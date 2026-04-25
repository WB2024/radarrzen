// nav.js — Spatial D-pad focus manager
const Nav = (() => {
  let focusEl = null;
  let backHandler = null;
  const FOCUS_ATTR = 'data-nav';
  const FOCUS_CLASS = 'nav-focused';

  // Scope can be limited to a container (e.g., modal focus trap)
  let scope = null;

  function root() { return scope || document; }

  function getAll() {
    return Array.from(root().querySelectorAll(
      `[${FOCUS_ATTR}]:not([disabled]):not([data-nav-skip])`
    )).filter(el => {
      // Skip invisible elements
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  function rect(el) { return el.getBoundingClientRect(); }

  function focus(el) {
    if (!el) return;
    if (focusEl && focusEl !== el) focusEl.classList.remove(FOCUS_CLASS);
    focusEl = el;
    el.classList.add(FOCUS_CLASS);
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch(e) {}
    if (typeof el.focus === 'function') {
      try { el.focus({ preventScroll: true }); } catch(e) { try { el.focus(); } catch(_){} }
    }
  }

  function move(direction) {
    const all = getAll();
    if (!all.length) return;
    if (!focusEl || !all.includes(focusEl)) { focus(all[0]); return; }

    const cr = rect(focusEl);
    const cx = cr.left + cr.width / 2;
    const cy = cr.top + cr.height / 2;

    let best = null, bestScore = Infinity;
    for (const el of all) {
      if (el === focusEl) continue;
      const r = rect(el);
      const ex = r.left + r.width / 2;
      const ey = r.top + r.height / 2;
      const dx = ex - cx, dy = ey - cy;

      if (direction === 'up'    && dy >= -2) continue;
      if (direction === 'down'  && dy <=  2) continue;
      if (direction === 'left'  && dx >= -2) continue;
      if (direction === 'right' && dx <=  2) continue;

      const primary = (direction === 'up' || direction === 'down') ? Math.abs(dy) : Math.abs(dx);
      const perp    = (direction === 'up' || direction === 'down') ? Math.abs(dx) : Math.abs(dy);
      const score   = primary + perp * 0.4;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) focus(best);
  }

  function onKeydown(e) {
    const code = e.keyCode;
    // Arrow nav
    const map = { 38: 'up', 40: 'down', 37: 'left', 39: 'right' };
    if (map[code]) {
      // Allow native cursor movement inside text inputs (left/right only)
      const t = e.target;
      const isText = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (isText && (code === 37 || code === 39)) return;
      e.preventDefault();
      move(map[code]);
      return;
    }
    // Enter
    if (code === 13) {
      if (focusEl && focusEl.tagName !== 'INPUT' && focusEl.tagName !== 'TEXTAREA') {
        e.preventDefault();
        focusEl.click();
      }
      return;
    }
    // Back (10009 = Tizen, 8 = Backspace fallback for browser only when not in input)
    if (code === 10009 || (code === 27)) { // ESC also = back in browser
      if (backHandler) {
        e.preventDefault();
        backHandler();
      }
    }
  }

  function init() {
    document.addEventListener('keydown', onKeydown, true);
  }

  function reset(defaultEl) {
    const all = getAll();
    focus(defaultEl || all[0] || null);
  }

  function setScope(container) { scope = container; focusEl = null; }
  function clearScope() { scope = null; focusEl = null; }

  function setBackHandler(fn) { backHandler = fn; }

  return {
    init, focus, move, reset,
    setScope, clearScope, setBackHandler,
    get current() { return focusEl; },
  };
})();
