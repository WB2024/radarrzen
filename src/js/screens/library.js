// screens/library.js — Movie grid (main screen)
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

  let openDropdown = null;
  let posterObserver = null;  // IntersectionObserver for lazy poster loading

  function render(host) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;';

    // Toolbar
    const tb = document.createElement('div');
    tb.className = 'toolbar';
    tb.innerHTML = `
      <span class="label">Filter:</span>
      <div class="dropdown" id="dd-filter"></div>
      <span class="label">Sort:</span>
      <div class="dropdown" id="dd-sort"></div>
      <span class="count" id="movie-count"></span>
    `;
    wrap.appendChild(tb);

    const grid = document.createElement('div');
    grid.className = 'movie-grid';
    grid.id = 'movie-grid';
    wrap.appendChild(grid);

    host.appendChild(wrap);

    buildDropdown('dd-filter', FILTERS, Store.state.libraryView.filter, (id) => {
      Store.state.libraryView.filter = id; renderGrid();
    });
    buildDropdown('dd-sort', SORTS, Store.state.libraryView.sort, (id) => {
      Store.state.libraryView.sort = id; renderGrid();
    });

    // Load movies (cache 60s)
    const stale = Date.now() - Store.state.moviesLoadedAt > 60_000;
    if (!Store.state.movies.length || stale) {
      const sp = Spinner.show(grid);
      RadarrAPI.movies.list().then(list => {
        Store.state.movies = list || [];
        Store.state.moviesLoadedAt = Date.now();
        Spinner.hide(sp);
        renderGrid();
      }).catch(e => {
        Spinner.hide(sp);
        Toast.show('Failed to load library: ' + e.message, 'error');
        grid.innerHTML = '<div class="empty-state"><h2>Could not load library</h2><p>' +
          escapeHtml(e.message) + '</p></div>';
      });
    } else {
      renderGrid();
    }
  }

  function buildDropdown(hostId, items, selectedId, onPick) {
    const host = document.getElementById(hostId);
    const sel = items.find(i => i.id === selectedId) || items[0];
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
      items.forEach(it => {
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
      openDropdown = { host, menu, btn };
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
    if (btn) Nav.focus(btn);
  }

  function renderGrid() {
    const grid = document.getElementById('movie-grid');
    if (!grid) return;
    const filt = FILTERS.find(f => f.id === Store.state.libraryView.filter) || FILTERS[0];
    const sort = SORTS.find(s => s.id === Store.state.libraryView.sort) || SORTS[0];
    const list = Store.state.movies.filter(filt.match).sort(sort.cmp);
    document.getElementById('movie-count').textContent = list.length + ' movies';

    // Disconnect any previous observer before clearing the grid
    if (posterObserver) { posterObserver.disconnect(); }

    grid.innerHTML = '';
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state"><h2>No movies match</h2><p>Try a different filter.</p></div>';
      return;
    }

    // IntersectionObserver: only load poster images when the card is near the viewport.
    // rootMargin '400px' means images start loading 400px before they scroll into view.
    posterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.target._loadPoster) {
          entry.target._loadPoster();
          entry.target._loadPoster = null;
          posterObserver.unobserve(entry.target);
        }
      });
    }, { root: grid, rootMargin: '400px 0px' });

    // Render DOM in batches so the first screenful appears immediately.
    const BATCH = 40;
    let i = 0;
    function chunk() {
      const batch = [];
      const frag = document.createDocumentFragment();
      for (let n = 0; n < BATCH && i < list.length; n++, i++) {
        const c = card(list[i]);
        frag.appendChild(c);
        batch.push(c);
      }
      grid.appendChild(frag);
      // Observe after appending to DOM so IntersectionObserver can measure positions
      batch.forEach(c => posterObserver.observe(c));
      if (i < list.length) requestAnimationFrame(chunk);
    }
    chunk();
  }

  function card(m) {
    const el = document.createElement('div');
    el.className = 'movie-card';
    el.dataset.nav = '';
    el.dataset.movieId = m.id;

    const wrap = document.createElement('div');
    wrap.className = 'poster-wrap';
    const ph = document.createElement('div');
    ph.className = 'poster-placeholder';
    ph.textContent = m.title || '';
    wrap.appendChild(ph);

    const img = document.createElement('img');
    img.alt = m.title || '';
    img.style.display = 'none';
    img.onload = () => { img.style.display = 'block'; ph.style.display = 'none'; };
    img.onerror = () => { img.style.display = 'none'; };
    wrap.appendChild(img);

    // Deferred poster load — called by IntersectionObserver when card is near viewport.
    // Prefer posterImgSrc() which returns a direct proxy URL the browser can HTTP-cache.
    // Falls back to fetchPoster() blob path when SAWSUBE is not configured.
    el._loadPoster = () => {
      const directUrl = RadarrAPI.posterImgSrc(m, 200);
      if (directUrl) {
        img.src = directUrl;
      } else {
        const posterSrc = RadarrAPI.posterUrlFromMovie(m) || RadarrAPI.posterUrl(m.id);
        RadarrAPI.fetchPoster(posterSrc).then(url => {
          if (url) img.src = url;
        });
      }
    };

    // Status badges
    const badges = document.createElement('div');
    badges.className = 'badges';
    if (m.hasFile) {
      const b = document.createElement('div');
      b.className = 'badge ok';
      b.textContent = '✓';
      badges.appendChild(b);
    } else if (m.monitored) {
      const b = document.createElement('div');
      b.className = 'badge warn';
      b.textContent = '●';
      badges.appendChild(b);
    }
    wrap.appendChild(badges);

    el.appendChild(wrap);

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = m.year ? `${m.title} (${m.year})` : m.title;
    el.appendChild(title);

    el.addEventListener('click', () => App.navigate('detail', { movieId: m.id }));

    return el;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
    ));
  }

  return { render };
})();
