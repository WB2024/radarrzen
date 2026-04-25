// nav.js — Spatial D-pad focus manager (Tizen-optimized)
//   • Instant scroll (smooth = sluggish on Tizen WebKit)
//   • Cached focusable list, invalidated on demand
//   • setMoveOverride(fn) — let virtualized screens own arrow nav
const Nav = (() => {
  let focusEl = null;
  let backHandler = null;
  let moveOverride = null;
  const FOCUS_ATTR = 'data-nav';
  const FOCUS_CLASS = 'nav-focused';

  let scope = null;
  let cachedList = null;
  let cachedListAt = 0;
  const CACHE_TTL_MS = 250;

  function root() { return scope || document; }

  function getAll() {
    const now = Date.now();
    if (cachedList && (now - cachedListAt) < CACHE_TTL_MS) return cachedList;
    const list = [];
    const nodes = root().querySelectorAll('[' + FOCUS_ATTR + ']:not([disabled]):not([data-nav-skip])');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.offsetParent === null && el !== document.activeElement) continue;
      list.push(el);
    }
    cachedList = list;
    cachedListAt = now;
    return list;
  }

  function invalidateCache() { cachedList = null; }

  function rect(el) { return el.getBoundingClientRect(); }

  function focus(el) {
    if (!el) return;
    if (focusEl && focusEl !== el) focusEl.classList.remove(FOCUS_CLASS);
    focusEl = el;
    el.classList.add(FOCUS_CLASS);
    try {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight ||
          r.left < 0 || r.right > window.innerWidth) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    } catch (e) {}
    if (typeof el.focus === 'function') {
      try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (_) {} }
    }
  }

  function move(direction) {
    if (moveOverride && focusEl) {
      try { if (moveOverride(direction, focusEl)) return; } catch (e) {}
    }
    const all = getAll();
    if (!all.length) return;
    if (!focusEl || all.indexOf(focusEl) < 0) { focus(all[0]); return; }

    const cr = rect(focusEl);
    const cx = cr.left + cr.width / 2;
    const cy = cr.top + cr.height / 2;

    let best = null, bestScore = Infinity;
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
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
    const map = { 38: 'up', 40: 'down', 37: 'left', 39: 'right' };
    if (map[code]) {
      // Tizen TV: arrow keys ALWAYS do spatial navigation, even when an
      // <input> is focused.  The on-screen IME owns text editing entirely;
      // letting LEFT/RIGHT move the caret would trap users in the input
      // (every press would step through characters before escaping).
      e.preventDefault();
      e.stopPropagation();
      // Make sure the input doesn't keep its caret blinking off-screen and
      // doesn't capture subsequent character keys when we navigate away.
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
        try { t.blur(); } catch (e) {}
      }
      move(map[code]);
      return;
    }
    if (code === 13) {
      if (focusEl && focusEl.tagName !== 'INPUT' && focusEl.tagName !== 'TEXTAREA') {
        e.preventDefault();
        focusEl.click();
      }
      return;
    }
    if (code === 10009 || code === 27) {
      if (backHandler) { e.preventDefault(); backHandler(); }
    }
  }

  function init() { document.addEventListener('keydown', onKeydown, true); }

  function reset(defaultEl) {
    invalidateCache();
    const all = getAll();
    focus(defaultEl || all[0] || null);
  }

  function setScope(container) { scope = container; focusEl = null; invalidateCache(); }
  function clearScope() { scope = null; focusEl = null; invalidateCache(); }
  function setBackHandler(fn) { backHandler = fn; }
  function setMoveOverride(fn) { moveOverride = fn; }
  function clearMoveOverride() { moveOverride = null; }

  return {
    init, focus, move, reset,
    setScope, clearScope, setBackHandler,
    setMoveOverride, clearMoveOverride, invalidateCache,
    get current() { return focusEl; },
  };
})();
