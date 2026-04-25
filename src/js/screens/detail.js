// screens/detail.js — Single movie detail + actions
const DetailScreen = (() => {
  function fmtBytes(n) {
    if (!n) return '0 B';
    const u = ['B','KB','MB','GB','TB'];
    let i = 0; let v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(v >= 100 ? 0 : 1) + ' ' + u[i];
  }

  function render(host, params = {}) {
    const id = params.movieId || Store.state.selectedMovieId;
    Store.state.selectedMovieId = id;
    const m = Store.state.movies.find(x => x.id === id);
    if (!m) {
      host.innerHTML = '<div class="empty-state"><h2>Movie not found</h2></div>';
      return;
    }

    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'detail-wrap';

    const rating = (m.ratings && m.ratings.tmdb && m.ratings.tmdb.value) || 0;
    const status = m.hasFile ? 'Downloaded'
                  : m.monitored ? 'Missing (Monitored)'
                  : 'Not Monitored';
    const file = m.movieFile || {};
    const quality = (file.quality && file.quality.quality && file.quality.quality.name) || '—';
    const size = m.sizeOnDisk ? fmtBytes(m.sizeOnDisk) : '—';
    const studio = m.studio || '—';

    wrap.innerHTML = `
      <div class="detail-top">
        <div class="detail-poster">
          <img id="d-poster" alt="">
        </div>
        <div class="detail-info">
          <h1>${esc(m.title)} ${m.year ? `<span style="color:var(--muted);font-weight:400;">(${m.year})</span>` : ''}</h1>
          <div class="meta">
            ${rating ? `★ ${rating.toFixed(1)}  ·  ` : ''}
            ${m.runtime ? `${m.runtime} min  ·  ` : ''}
            ${m.certification || ''}
          </div>
          <div class="overview">${esc(m.overview || 'No overview available.')}</div>
          <dl class="detail-stats">
            <dt>Status</dt><dd>${esc(status)}</dd>
            <dt>Quality</dt><dd>${esc(quality)}</dd>
            <dt>Size</dt><dd>${esc(size)}</dd>
            <dt>Studio</dt><dd>${esc(studio)}</dd>
            <dt>Path</dt><dd style="color:var(--muted);font-size:15px;">${esc(m.path || '—')}</dd>
          </dl>
          <div class="detail-actions">
            <button class="btn btn-primary" data-nav id="d-search">▶ Search Releases</button>
            <button class="btn" data-nav id="d-monitor">${m.monitored ? '✓ Monitored' : '○ Unmonitored'}</button>
            <button class="btn btn-danger" data-nav id="d-delete">✕ Delete</button>
            <button class="btn" data-nav id="d-back">← Back</button>
          </div>
        </div>
      </div>
    `;
    host.appendChild(wrap);

    // Poster
    const $img = document.getElementById('d-poster');
    $img.onerror = () => { $img.style.display = 'none'; };
    const posterSrc = RadarrAPI.posterUrlFromMovie(m) || RadarrAPI.posterUrl(m.id, 500);
    RadarrAPI.fetchPoster(posterSrc).then(blobUrl => {
      if (blobUrl) { $img.src = blobUrl; } else { $img.style.display = 'none'; }
    });

    // Actions
    document.getElementById('d-search').addEventListener('click', async () => {
      try {
        await RadarrAPI.command.moviesSearch([m.id]);
        Toast.show('Searching for releases…', 'success');
      } catch (e) { Toast.show('Search failed: ' + e.message, 'error'); }
    });

    document.getElementById('d-monitor').addEventListener('click', async () => {
      try {
        const updated = { ...m, monitored: !m.monitored };
        await RadarrAPI.movies.edit(m.id, updated);
        // Update cache
        const idx = Store.state.movies.findIndex(x => x.id === m.id);
        if (idx >= 0) Store.state.movies[idx] = updated;
        Toast.show(updated.monitored ? 'Now monitoring' : 'Unmonitored', 'success');
        render(host, { movieId: m.id });
      } catch (e) { Toast.show('Update failed: ' + e.message, 'error'); }
    });

    document.getElementById('d-delete').addEventListener('click', () => confirmDelete(m));
    document.getElementById('d-back').addEventListener('click', () => App.navigate('library'));

    setTimeout(() => Nav.focus(document.getElementById('d-search')), 30);
  }

  function confirmDelete(m) {
    const previousFocus = Nav.current;
    const root = document.getElementById('modal-root');
    root.innerHTML = '';

    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `
      <div class="modal" role="dialog">
        <h2>Delete movie?</h2>
        <p>Remove <strong>${esc(m.title)}</strong> from Radarr.<br>
           Files on disk will <strong>not</strong> be deleted.</p>
        <div class="modal-actions">
          <button class="btn" data-nav id="m-cancel">Cancel</button>
          <button class="btn btn-danger" data-nav id="m-confirm">Delete</button>
        </div>
      </div>
    `;
    root.appendChild(back);

    const modal = back.querySelector('.modal');
    Nav.setScope(modal);
    setTimeout(() => Nav.focus(document.getElementById('m-cancel')), 20);

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

  return { render };
})();
