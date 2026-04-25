// screens/library.js — Virtualized movie grid (Tizen-optimized)
//
// For 1000+ movies, rendering all DOM cards kills Tizen TVs.  We virtualize:
// only ~3 viewport rows (≈25–40 cards) live in the DOM at any time, positioned
// absolutely.  Arrow keys move a logical index; we ensure the target is rendered,
// then focus it.
//
const LibraryScreen = (() => {
  const FILTERS = [
    { id: 'all',        label: 'All',        match: () => true },
    { id: 'downloaded', label: 'Downloaded', match: m => !!m.hasFile },
    { id: 'missing',    label: 'Missing',    match: m => !m.hasFile && m.monitored },
    { id: 'monitored',  label: 'Monitored',  match: m => !!m.monitored },
  ];
  const SORTS = [
    { id: 'title',  label: 'Title',  cmp: (a,b) => (a.sortTitle||a.title||'').localeCompare(b.sortTitle||b.title||'') },
    { id: 'year',   label: 'Year',   cmp: (a,b) => (b.year||0) - (a.year||0) },
    { id: 'added',  label: 'Added',  cmp: (a,b) => new Date(b.added||0) - new Date(a.added||0) },
    { id: 'rating', label: 'Rating', cmp: (a,b) => (ratingOf(b) - ratingOf(a)) },
  ];
  function ratingOf(m) {
    return (m.ratings && m.ratings.tmdb && m.ratings.tmdb.value) || 0;
  }

  // Layout constants — kept in sync with CSS.
  const CARD_W   = 200;
  const CARD_H   = 300;     // poster area
  const TITLE_H  = 56;      // 2 lines of title
  const ROW_H    = CARD_H + TITLE_H;
  const GAP      = 20;
  const PAD_X    = 32;
  const PAD_Y    = 24;
  const BUFFER_ROWS = 2;    // pre-render this many rows above + below viewport

  let openDropdown = null;

  // Virtualization state
  let vp = null;            // scrolling viewport element
  let inner = null;         // tall spacer holding absolutely-positioned cards
  let items = [];           // current filtered+sorted slim movies
  let cols = 1;
  let totalRows = 0;
  let mounted = new Map();  // index → DOM node (recycle pool)
  let focusIndex = 0;
  let scrollScheduled = false;

  function render(host) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;';

    const tb = document.createElement('div');
    tb.className = 'toolbar';
    tb.innerHTML =
      '<span class="label">Filter:</span>' +
      '<div class="dropdown" id="dd-filter"></div>' +
      '<span class="label">Sort:</span>' +
      '<div class="dropdown" id="dd-sort"></div>' +
      '<span class="count" id="movie-count"></span>';
    wrap.appendChild(tb);

    vp = document.createElement('div');
    vp.className = 'movie-vp';
    vp.id = 'movie-vp';
    inner = document.createElement('div');
    inner.className = 'movie-inner';
    vp.appendChild(inner);
    wrap.appendChild(vp);

    host.appendChild(wrap);

    buildDropdown('dd-filter', FILTERS, Store.state.libraryView.filter, (id) => {
      Store.state.libraryView.filter = id;
      Store.state.libraryScrollTop = 0;
      Store.state.libraryFocusIndex = 0;
      buildItemsAndRender();
    });
    buildDropdown('dd-sort', SORTS, Store.state.libraryView.sort, (id) => {
      Store.state.libraryView.sort = id;
      Store.state.libraryScrollTop = 0;
      Store.state.libraryFocusIndex = 0;
      buildItemsAndRender();
    });

    vp.addEventListener('scroll', onScroll, { passive: true });

    // Show cached movies instantly (if any), then refresh in background
    const cacheLoaded = Store.state.movies.length > 0 || Store.loadMoviesCache();
    if (cacheLoaded) {
      buildItemsAndRender();
      // Background refresh if stale (>5 min)
      if (!Store.moviesAreFresh()) refreshMovies();
    } else {
      const sp = Spinner.show(vp);
      RadarrAPI.movies.list().then(list => {
        Store.saveMoviesCache(list || []);
        Spinner.hide(sp);
        buildItemsAndRender();
      }).catch(e => {
        Spinner.hide(sp);
        Toast.show('Failed to load library: ' + e.message, 'error');
        inner.innerHTML = '<div class="empty-state"><h2>Could not load library</h2><p>' +
          esc(e.message) + '</p></div>';
      });
    }

    // Install grid arrow handler (capture phase, runs before Nav)
    document.addEventListener('keydown', onGridKey, true);

    // Re-layout on resize
    window.addEventListener('resize', onResize);
  }

  function teardown() {
    document.removeEventListener('keydown', onGridKey, true);
    window.removeEventListener('resize', onResize);
    if (vp) vp.removeEventListener('scroll', onScroll);
    Nav.clearMoveOverride();
    // Save state for return-from-detail
    if (vp) Store.state.libraryScrollTop = vp.scrollTop;
    Store.state.libraryFocusIndex = focusIndex;
    mounted.clear();
    vp = null; inner = null;
  }

  function refreshMovies() {
    RadarrAPI.movies.list().then(list => {
      Store.saveMoviesCache(list || []);
      buildItemsAndRender();
    }).catch(() => {});
  }

  function buildItemsAndRender() {
    const filt = FILTERS.find(f => f.id === Store.state.libraryView.filter) || FILTERS[0];
    const sort = SORTS.find(s => s.id === Store.state.libraryView.sort) || SORTS[0];
    items = Store.state.movies.filter(filt.match).sort(sort.cmp);
    const cnt = document.getElementById('movie-count');
    if (cnt) cnt.textContent = items.length + ' movies';

    // Items have changed — discard ALL mounted cards.  Without this, the
    // recycle pool keeps node-at-index-N showing the OLD movie that used to
    // be at index N before the sort/filter changed.
    mounted.forEach((node) => { if (node && node.parentNode) node.parentNode.removeChild(node); });
    mounted.clear();
    inner.innerHTML = '';

    if (!items.length) {
      inner.style.height = '0px';
      inner.innerHTML = '<div class="empty-state"><h2>No movies match</h2><p>Try a different filter.</p></div>';
      return;
    }

    layout();
    // Restore (or reset) scroll position
    if (vp) vp.scrollTop = Store.state.libraryScrollTop || 0;
    focusIndex = Math.min(Store.state.libraryFocusIndex || 0, items.length - 1);
    renderWindow();
    setTimeout(() => focusCard(focusIndex), 16);
  }

  function layout() {
    const vpW = vp.clientWidth || 1920;
    cols = Math.max(1, Math.floor((vpW - PAD_X * 2 + GAP) / (CARD_W + GAP)));
    totalRows = Math.ceil(items.length / cols);
    const totalH = PAD_Y * 2 + totalRows * ROW_H + (totalRows - 1) * GAP;
    inner.style.height = totalH + 'px';
  }

  function onResize() {
    if (!vp || !items.length) return;
    layout();
    renderWindow();
  }

  function onScroll() {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(() => {
      scrollScheduled = false;
      renderWindow();
    });
  }

  function visibleRange() {
    const top = vp.scrollTop;
    const h = vp.clientHeight;
    const firstRow = Math.max(0, Math.floor((top - PAD_Y) / (ROW_H + GAP)) - BUFFER_ROWS);
    const lastRow  = Math.min(totalRows - 1,
                              Math.ceil((top + h - PAD_Y) / (ROW_H + GAP)) + BUFFER_ROWS);
    const startIdx = firstRow * cols;
    const endIdx   = Math.min(items.length - 1, (lastRow + 1) * cols - 1);
    return { startIdx, endIdx };
  }

  function renderWindow() {
    if (!vp || !items.length) return;
    const { startIdx, endIdx } = visibleRange();

    // Unmount cards outside window
    const toRemove = [];
    mounted.forEach((node, idx) => {
      if (idx < startIdx || idx > endIdx) toRemove.push(idx);
    });
    for (let i = 0; i < toRemove.length; i++) {
      const node = mounted.get(toRemove[i]);
      if (node && node.parentNode) node.parentNode.removeChild(node);
      mounted.delete(toRemove[i]);
    }

    // Mount new cards
    const frag = document.createDocumentFragment();
    let added = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      if (mounted.has(i)) continue;
      const node = buildCard(items[i], i);
      mounted.set(i, node);
      frag.appendChild(node);
      added++;
    }
    if (added) inner.appendChild(frag);

    Nav.invalidateCache();
  }

  function positionFor(index) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = PAD_X + col * (CARD_W + GAP);
    const y = PAD_Y + row * (ROW_H + GAP);
    return { x: x, y: y };
  }

  function buildCard(m, index) {
    const el = document.createElement('div');
    el.className = 'movie-card';
    el.dataset.nav = '';
    el.dataset.index = index;
    el.dataset.movieId = m.id;
    const pos = positionFor(index);
    el.style.cssText =
      'position:absolute;left:' + pos.x + 'px;top:' + pos.y +
      'px;width:' + CARD_W + 'px;height:' + ROW_H + 'px;';

    // Poster wrap
    const wrap = document.createElement('div');
    wrap.className = 'poster-wrap';
    wrap.style.height = CARD_H + 'px';
    const ph = document.createElement('div');
    ph.className = 'poster-placeholder';
    ph.textContent = m.title || '';
    wrap.appendChild(ph);

    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.style.opacity = '0';
    img.onload = () => { img.style.opacity = '1'; ph.style.display = 'none'; };
    img.onerror = () => { img.style.display = 'none'; };
    img.src = RadarrAPI.posterImgSrc(m, 200);
    wrap.appendChild(img);

    if (m.hasFile) {
      const b = document.createElement('div');
      b.className = 'badges';
      b.innerHTML = '<div class="badge ok">✓</div>';
      wrap.appendChild(b);
    } else if (m.monitored) {
      const b = document.createElement('div');
      b.className = 'badges';
      b.innerHTML = '<div class="badge warn">●</div>';
      wrap.appendChild(b);
    }

    el.appendChild(wrap);

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = m.year ? (m.title + ' (' + m.year + ')') : m.title;
    el.appendChild(title);

    el.addEventListener('click', () => {
      Store.state.libraryFocusIndex = index;
      if (vp) Store.state.libraryScrollTop = vp.scrollTop;
      App.navigate('detail', { movieId: m.id });
    });

    return el;
  }

  function ensureRendered(index) {
    if (mounted.has(index)) return;
    // Scroll so target row is visible, then renderWindow will mount it
    const row = Math.floor(index / cols);
    const targetTop = PAD_Y + row * (ROW_H + GAP);
    const vpTop = vp.scrollTop;
    const vpBottom = vpTop + vp.clientHeight;
    if (targetTop < vpTop) {
      vp.scrollTop = Math.max(0, targetTop - PAD_Y);
    } else if (targetTop + ROW_H > vpBottom) {
      vp.scrollTop = targetTop + ROW_H - vp.clientHeight + PAD_Y;
    }
    renderWindow();
  }

  function focusCard(index) {
    if (!items.length) return;
    index = Math.max(0, Math.min(items.length - 1, index));
    focusIndex = index;
    ensureRendered(index);
    const node = mounted.get(index);
    if (node) Nav.focus(node);
  }

  // Custom arrow handling for the virtualized grid.
  // Active only when focus is on a movie card (i.e., grid context).
  function onGridKey(e) {
    if (Store.state.currentScreen !== 'library') return;
    if (openDropdown) return;
    const cur = Nav.current;
    if (!cur || !cur.classList.contains('movie-card')) return;

    const code = e.keyCode;
    let next = focusIndex;
    if (code === 37) next -= 1;             // left
    else if (code === 39) next += 1;        // right
    else if (code === 38) next -= cols;     // up
    else if (code === 40) next += cols;     // down
    else return;

    if (next < 0) {
      // Going up off the top → focus toolbar
      e.preventDefault();
      e.stopImmediatePropagation();
      const tb = document.querySelector('.toolbar [data-nav]');
      if (tb) Nav.focus(tb);
      return;
    }
    if (next >= items.length) return;       // clamp at end
    e.preventDefault();
    e.stopImmediatePropagation();
    focusCard(next);
  }

  // ── Dropdown helpers ─────────────────────────────────────────────
  function buildDropdown(hostId, dItems, selectedId, onPick) {
    const host = document.getElementById(hostId);
    const sel = dItems.find(i => i.id === selectedId) || dItems[0];
    host.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'dropdown-btn';
    btn.dataset.nav = '';
    btn.textContent = sel.label + ' ▾';
    host.appendChild(btn);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (openDropdown && openDropdown.host === host) { closeDropdown(); return; }
      closeDropdown();
      const menu = document.createElement('div');
      menu.className = 'dropdown-menu';
      dItems.forEach(it => {
        const opt = document.createElement('div');
        opt.className = 'dropdown-item';
        opt.dataset.nav = '';
        opt.textContent = it.label;
        opt.addEventListener('click', (ev) => {
          ev.stopPropagation();
          closeDropdown();
          onPick(it.id);
        });
        menu.appendChild(opt);
      });
      host.appendChild(menu);
      openDropdown = { host: host, menu: menu, btn: btn };
      Nav.invalidateCache();
      setTimeout(() => Nav.focus(menu.querySelector('.dropdown-item')), 10);
    });
  }

  function closeDropdown() {
    if (!openDropdown) return;
    if (openDropdown.menu && openDropdown.menu.parentNode) {
      openDropdown.menu.parentNode.removeChild(openDropdown.menu);
    }
    const btn = openDropdown.btn;
    openDropdown = null;
    Nav.invalidateCache();
    if (btn) Nav.focus(btn);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
    ));
  }

  return { render, teardown };
})();
