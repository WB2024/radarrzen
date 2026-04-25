// screens/search.js — Search TMDB / add movie
const SearchScreen = (() => {
  let debounceTimer = null;
  let lastQuery = '';
  let openOverlay = null;

  function render(host) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'search-wrap';
    wrap.innerHTML = `
      <div class="search-bar">
        <input id="s-input" class="input" type="text" data-nav
               placeholder="Search for a movie title…">
      </div>
      <div id="s-status" class="search-status">Type a movie title to search.</div>
      <div id="s-results" class="search-results movie-grid" style="display:none;"></div>
    `;
    host.appendChild(wrap);

    const $in = document.getElementById('s-input');
    $in.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = $in.value.trim();
      if (q.length < 2) {
        document.getElementById('s-status').style.display = 'block';
        document.getElementById('s-status').textContent = 'Type at least 2 characters…';
        document.getElementById('s-results').style.display = 'none';
        return;
      }
      debounceTimer = setTimeout(() => doSearch(q), 600);
    });

    setTimeout(() => Nav.focus($in), 30);
  }

  async function doSearch(q) {
    if (q === lastQuery) return;
    lastQuery = q;
    const $st = document.getElementById('s-status');
    const $res = document.getElementById('s-results');
    $st.style.display = 'block';
    $st.textContent = 'Searching…';
    $res.style.display = 'none';
    try {
      const results = await RadarrAPI.lookup.search(q);
      if (!results || !results.length) {
        $st.textContent = 'No results.';
        return;
      }
      $st.style.display = 'none';
      $res.style.display = 'grid';
      $res.innerHTML = '';
      results.slice(0, 60).forEach(r => $res.appendChild(card(r)));
    } catch (e) {
      $st.textContent = 'Search failed: ' + e.message;
    }
  }

  function card(r) {
    const inLib = !!(r.id || Store.state.movies.find(m => m.tmdbId === r.tmdbId));
    const el = document.createElement('div');
    el.className = 'movie-card';
    el.dataset.nav = '';

    const wrap = document.createElement('div');
    wrap.className = 'poster-wrap';
    const ph = document.createElement('div');
    ph.className = 'poster-placeholder';
    ph.textContent = r.title || '';
    wrap.appendChild(ph);

    const posterUrl = pickImage(r, 'poster');
    if (posterUrl) {
      const img = document.createElement('img');
      img.loading = 'lazy'; img.alt = r.title || '';
      img.style.display = 'none';
      img.onload = () => { img.style.display = 'block'; ph.style.display = 'none'; };
      img.onerror = () => { img.remove(); };
      // Use proxy for Radarr-hosted URLs; TMDB remote URLs can be loaded directly
      const isRadarrUrl = posterUrl.includes(RadarrAPI.rawBase());
      if (isRadarrUrl) {
        RadarrAPI.fetchPoster(posterUrl).then(blobUrl => {
          if (blobUrl) { img.src = blobUrl; } else { img.remove(); }
        });
      } else {
        img.src = posterUrl;
      }
      wrap.appendChild(img);
    }

    if (inLib) {
      const b = document.createElement('div');
      b.className = 'badges';
      b.innerHTML = '<div class="badge ok">In Library</div>';
      wrap.appendChild(b);
    }

    el.appendChild(wrap);
    const t = document.createElement('div');
    t.className = 'title';
    t.textContent = r.year ? `${r.title} (${r.year})` : r.title;
    el.appendChild(t);

    el.addEventListener('click', () => {
      if (inLib) { Toast.show('Already in library', 'info'); return; }
      openAddOverlay(r);
    });
    return el;
  }

  function pickImage(r, type) {
    if (!r.images) return null;
    const img = r.images.find(i => i.coverType === type);
    return img ? (img.remoteUrl || img.url) : null;
  }

  function openAddOverlay(r) {
    const previousFocus = Nav.current;
    const root = document.getElementById('modal-root');
    root.innerHTML = '';

    const profiles = Store.state.qualityProfiles;
    const folders  = Store.state.rootFolders;

    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `
      <div class="modal" style="min-width:600px;">
        <h2>Add ${esc(r.title)} ${r.year ? `(${r.year})` : ''}</h2>
        <p style="color:var(--muted);max-height:140px;overflow:auto;">${esc(r.overview || '')}</p>
        <div class="field">
          <label>Quality Profile</label>
          <div id="qp-dd" class="dropdown"></div>
        </div>
        <div class="field">
          <label>Root Folder</label>
          <div id="rf-dd" class="dropdown"></div>
        </div>
        <div class="modal-actions">
          <button class="btn" data-nav id="add-cancel">Cancel</button>
          <button class="btn btn-primary" data-nav id="add-confirm">+ Add Movie</button>
        </div>
      </div>
    `;
    root.appendChild(back);

    const modal = back.querySelector('.modal');
    Nav.setScope(modal);
    openOverlay = back;

    const state = {
      profileId: profiles[0] && profiles[0].id,
      rootPath:  folders[0]  && folders[0].path,
    };

    buildPickerDropdown('qp-dd', profiles.map(p => ({ id: p.id, label: p.name })),
      state.profileId, (id) => { state.profileId = id; });
    buildPickerDropdown('rf-dd', folders.map(f => ({ id: f.path, label: f.path })),
      state.rootPath, (id) => { state.rootPath = id; });

    function close() {
      Nav.clearScope();
      root.innerHTML = '';
      openOverlay = null;
      if (previousFocus) Nav.focus(previousFocus);
    }
    document.getElementById('add-cancel').addEventListener('click', close);
    document.getElementById('add-confirm').addEventListener('click', async () => {
      try {
        const body = {
          title: r.title,
          tmdbId: r.tmdbId,
          year: r.year,
          qualityProfileId: state.profileId,
          rootFolderPath: state.rootPath,
          monitored: true,
          minimumAvailability: 'released',
          addOptions: { searchForMovie: true, monitor: 'movieOnly' },
          images: r.images || [],
        };
        await RadarrAPI.movies.add(body);
        Toast.show('Added to library', 'success');
        // Invalidate cached movies
        Store.state.moviesLoadedAt = 0;
        close();
      } catch (e) {
        Toast.show('Add failed: ' + e.message, 'error');
      }
    });

    setTimeout(() => Nav.focus(document.getElementById('add-confirm')), 20);
  }

  function buildPickerDropdown(hostId, items, selectedId, onPick) {
    const host = document.getElementById(hostId);
    const sel = items.find(i => i.id === selectedId) || items[0];
    host.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'dropdown-btn';
    btn.dataset.nav = '';
    btn.textContent = (sel ? sel.label : '—') + ' ▾';
    host.appendChild(btn);
    let menu = null;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu) { menu.remove(); menu = null; return; }
      menu = document.createElement('div');
      menu.className = 'dropdown-menu';
      items.forEach(it => {
        const o = document.createElement('div');
        o.className = 'dropdown-item';
        o.dataset.nav = '';
        o.textContent = it.label;
        o.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onPick(it.id);
          btn.textContent = it.label + ' ▾';
          menu.remove(); menu = null;
          Nav.focus(btn);
        });
        menu.appendChild(o);
      });
      host.appendChild(menu);
      setTimeout(() => Nav.focus(menu.querySelector('.dropdown-item')), 10);
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
    ));
  }

  return { render };
})();
