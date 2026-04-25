// screens/detail.js — Single movie detail + actions (Tizen-optimized)
const DetailScreen = (() => {
  function fmtBytes(n) {
    if (!n) return '0 B';
    const u = ['B','KB','MB','GB','TB'];
    let i = 0; let v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(v >= 100 ? 0 : 1) + ' ' + u[i];
  }

  function render(host, params) {
    params = params || {};
    const id = params.movieId || Store.state.selectedMovieId;
    Store.state.selectedMovieId = id;
    const slim = Store.state.movies.find(x => x.id === id);
    if (!slim) {
      host.innerHTML = '<div class="empty-state"><h2>Movie not found</h2></div>';
      return;
    }

    // Render shell immediately from slim cache so screen shows fast,
    // then enrich with full /movie/:id details (overview, file, etc).
    renderShell(host, slim);
    RadarrAPI.movies.get(id).then(full => {
      // Merge full details for richer view
      enrichDetail(full || slim);
    }).catch(() => {/* ignore — slim view is fine */});
  }

  function renderShell(host, m) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'detail-wrap';

    const rating = (m.ratings && m.ratings.tmdb && m.ratings.tmdb.value) || 0;
    const status = m.hasFile ? 'Downloaded'
                  : m.monitored ? 'Missing (Monitored)'
                  : 'Not Monitored';

    wrap.innerHTML =
      '<div class="detail-top">' +
        '<div class="detail-poster"><img id="d-poster" alt=""></div>' +
        '<div class="detail-info">' +
          '<h1>' + esc(m.title) + (m.year ? ' <span style="color:var(--muted);font-weight:400;">(' + m.year + ')</span>' : '') + '</h1>' +
          '<div class="meta" id="d-meta">' + (rating ? ('★ ' + rating.toFixed(1)) : '') + '</div>' +
          '<div class="overview" id="d-overview">Loading…</div>' +
          '<dl class="detail-stats" id="d-stats">' +
            '<dt>Status</dt><dd>' + esc(status) + '</dd>' +
          '</dl>' +
          '<div class="detail-actions">' +
            '<button class="btn btn-primary" data-nav id="d-search">▶ Search Releases</button>' +
            '<button class="btn" data-nav id="d-monitor">' + (m.monitored ? '✓ Monitored' : '○ Unmonitored') + '</button>' +
            '<button class="btn btn-danger" data-nav id="d-delete">✕ Delete</button>' +
            '<button class="btn" data-nav id="d-back">← Back</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    host.appendChild(wrap);

    // Poster — direct URL via SAWSUBE proxy (HTTP-cached, no blob round-trip)
    const $img = document.getElementById('d-poster');
    $img.onerror = () => { $img.style.display = 'none'; };
    const src = RadarrAPI.posterImgSrc(m, 400);
    if (src) $img.src = src;

    document.getElementById('d-search').addEventListener('click', () => interactiveSearch(m));
    document.getElementById('d-monitor').addEventListener('click', () => toggleMonitor(host, m));
    document.getElementById('d-delete').addEventListener('click', () => confirmDelete(m));
    document.getElementById('d-back').addEventListener('click', () => App.navigate('library'));

    setTimeout(() => Nav.focus(document.getElementById('d-search')), 16);
  }

  function enrichDetail(m) {
    const meta = document.getElementById('d-meta');
    const overview = document.getElementById('d-overview');
    const stats = document.getElementById('d-stats');
    if (!meta || !overview || !stats) return;

    const rating = (m.ratings && m.ratings.tmdb && m.ratings.tmdb.value) || 0;
    const file = m.movieFile || {};
    const quality = (file.quality && file.quality.quality && file.quality.quality.name) || '—';
    const size = m.sizeOnDisk ? fmtBytes(m.sizeOnDisk) : '—';
    const studio = m.studio || '—';
    const status = m.hasFile ? 'Downloaded' : m.monitored ? 'Missing (Monitored)' : 'Not Monitored';

    meta.innerHTML =
      (rating ? ('★ ' + rating.toFixed(1) + '  ·  ') : '') +
      (m.runtime ? (m.runtime + ' min  ·  ') : '') +
      esc(m.certification || '');
    overview.textContent = m.overview || 'No overview available.';
    stats.innerHTML =
      '<dt>Status</dt><dd>' + esc(status) + '</dd>' +
      '<dt>Quality</dt><dd>' + esc(quality) + '</dd>' +
      '<dt>Size</dt><dd>' + esc(size) + '</dd>' +
      '<dt>Studio</dt><dd>' + esc(studio) + '</dd>' +
      '<dt>Path</dt><dd style="color:var(--muted);font-size:15px;">' + esc(m.path || '—') + '</dd>';
  }

  async function toggleMonitor(host, m) {
    try {
      // Need full movie object for PUT — fetch it
      const full = await RadarrAPI.movies.get(m.id);
      full.monitored = !full.monitored;
      await RadarrAPI.movies.edit(m.id, full);
      const idx = Store.state.movies.findIndex(x => x.id === m.id);
      if (idx >= 0) Store.state.movies[idx] = Store.slimMovie(full);
      Toast.show(full.monitored ? 'Now monitoring' : 'Unmonitored', 'success');
      render(host, { movieId: m.id });
    } catch (e) { Toast.show('Update failed: ' + e.message, 'error'); }
  }

  function confirmDelete(m) {
    const previousFocus = Nav.current;
    const root = document.getElementById('modal-root');
    root.innerHTML = '';

    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML =
      '<div class="modal" role="dialog">' +
        '<h2>Delete movie?</h2>' +
        '<p>Remove <strong>' + esc(m.title) + '</strong> from Radarr.<br>' +
           'Files on disk will <strong>not</strong> be deleted.</p>' +
        '<div class="modal-actions">' +
          '<button class="btn" data-nav id="m-cancel">Cancel</button>' +
          '<button class="btn btn-danger" data-nav id="m-confirm">Delete</button>' +
        '</div>' +
      '</div>';
    root.appendChild(back);

    const modal = back.querySelector('.modal');
    Nav.setScope(modal);
    setTimeout(() => Nav.focus(document.getElementById('m-cancel')), 16);

    function close() {
      Nav.clearScope();
      root.innerHTML = '';
      if (previousFocus) Nav.focus(previousFocus);
    }

    document.getElementById('m-cancel').addEventListener('click', close);
    document.getElementById('m-confirm').addEventListener('click', async () => {
      try {
        await RadarrAPI.movies.del(m.id, false);
        Store.state.movies = Store.state.movies.filter(x => x.id !== m.id);
        Toast.show('Movie removed', 'success');
        close();
        App.navigate('library');
      } catch (e) {
        Toast.show('Delete failed: ' + e.message, 'error');
        close();
      }
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
    ));
  }

  function fmtAge(r) {
    const h = r.ageHours || (r.age || 0) * 24;
    if (h < 24) return Math.round(h) + 'h';
    if (h < 24 * 7) return Math.round(h / 24) + 'd';
    return Math.round(h / 24 / 7) + 'w';
  }

  function interactiveSearch(m) {
    const previousFocus = Nav.current;
    const root = document.getElementById('modal-root');
    root.innerHTML = '';

    const back = document.createElement('div');
    back.className = 'modal-backdrop isr-backdrop';
    root.appendChild(back);

    const panel = document.createElement('div');
    panel.className = 'isr-panel';
    panel.innerHTML =
      '<div class="isr-header">' +
        '<span class="isr-title">Interactive Search — ' + esc(m.title) + '</span>' +
        '<button class="isr-close btn" data-nav id="isr-close">✕ Close</button>' +
      '</div>' +
      '<div class="isr-body" id="isr-body">' +
        '<div class="isr-loading">Searching indexers…<div class="spinner" style="margin:16px auto 0;"></div></div>' +
      '</div>';
    back.appendChild(panel);

    Nav.setScope(panel);
    setTimeout(() => Nav.focus(document.getElementById('isr-close')), 16);

    function close() {
      Nav.clearScope();
      root.innerHTML = '';
      if (previousFocus) Nav.focus(previousFocus);
    }
    document.getElementById('isr-close').addEventListener('click', close);

    RadarrAPI.release.search(m.id).then(results => {
      const body = document.getElementById('isr-body');
      if (!results || !results.length) {
        body.innerHTML = '<div class="isr-empty">No releases found.</div>';
        return;
      }
      results.sort((a, b) => {
        if (a.rejected !== b.rejected) return a.rejected ? 1 : -1;
        return (b.qualityWeight || 0) - (a.qualityWeight || 0);
      });

      // Cap to top 100 — Tizen TV chokes on huge tables
      const cap = results.slice(0, 100);

      const table = document.createElement('table');
      table.className = 'isr-table';
      table.innerHTML =
        '<thead><tr>' +
          '<th>Source</th><th>Age</th><th>Title</th>' +
          '<th>Indexer</th><th>Size</th><th>Peers</th>' +
          '<th>Quality</th><th></th>' +
        '</tr></thead>';
      const tbody = document.createElement('tbody');

      cap.forEach(r => {
        const tr = document.createElement('tr');
        if (r.rejected) tr.className = 'isr-rejected';
        const proto = (r.downloadProtocol || '').toLowerCase();
        const protoBadge = proto === 'torrent'
          ? '<span class="isr-proto torrent">TRK</span>'
          : '<span class="isr-proto nzb">NZB</span>';
        const peers = proto === 'torrent'
          ? ((r.seeders || 0) + '/' + (r.leechers || 0))
          : '—';
        const qualName = (r.quality && r.quality.quality && r.quality.quality.name) || '—';
        const lang = (r.languages && r.languages[0] && r.languages[0].name) || '';
        const rejectTip = r.rejections && r.rejections.length
          ? r.rejections.map(x => x.reason || x).join(', ')
          : '';

        tr.innerHTML =
          '<td>' + protoBadge + '</td>' +
          '<td class="isr-age">' + esc(fmtAge(r)) + '</td>' +
          '<td class="isr-title-cell" title="' + esc(r.title) + '">' + esc(r.title) + '</td>' +
          '<td class="isr-indexer">' + esc(r.indexer || '—') + '</td>' +
          '<td class="isr-size">' + esc(fmtBytes(r.size)) + '</td>' +
          '<td class="isr-peers">' + esc(peers) + '</td>' +
          '<td><span class="isr-quality">' + esc(qualName) + '</span>' + (lang ? (' <span class="isr-lang">' + esc(lang) + '</span>') : '') + '</td>' +
          '<td class="isr-actions"></td>';

        const actCell = tr.querySelector('.isr-actions');
        if (r.rejected) {
          const warn = document.createElement('span');
          warn.className = 'isr-warn';
          warn.title = rejectTip;
          warn.textContent = '⚠ Rejected';
          actCell.appendChild(warn);
        }
        const grabBtn = document.createElement('button');
        grabBtn.className = 'btn isr-grab-btn';
        grabBtn.dataset.nav = '';
        grabBtn.textContent = '⬇ Grab';
        grabBtn.addEventListener('click', async () => {
          grabBtn.disabled = true;
          grabBtn.textContent = '…';
          try {
            await RadarrAPI.release.grab({ guid: r.guid, indexerId: r.indexerId });
            Toast.show('Grabbing: ' + r.title, 'success');
            grabBtn.textContent = '✓ Grabbed';
            grabBtn.className = 'btn isr-grab-btn isr-grabbed';
          } catch (e) {
            Toast.show('Grab failed: ' + e.message, 'error');
            grabBtn.disabled = false;
            grabBtn.textContent = '⬇ Grab';
          }
        });
        actCell.appendChild(grabBtn);
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      body.innerHTML = '';
      body.appendChild(table);
      Nav.invalidateCache();

      // Delay focus to first grab button by 400ms to avoid Tizen key-repeat
      // firing immediately after the modal opens (user still releasing OK key).
      // Focus the close button immediately so something is always focused.
      const firstBtn = panel.querySelector('.isr-grab-btn');
      const closeBtn = document.getElementById('isr-close');
      if (closeBtn) Nav.focus(closeBtn);
      if (firstBtn) setTimeout(() => Nav.focus(firstBtn), 400);
    }).catch(e => {
      const body = document.getElementById('isr-body');
      if (body) body.innerHTML = '<div class="isr-empty">Search failed: ' + esc(e.message) + '</div>';
    });
  }

  return { render };
})();
