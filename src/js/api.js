// api.js — Radarr REST API v3 client
const RadarrAPI = (() => {
  let base = '', key = '';

  function configure(url, apiKey) {
    base = url.replace(/\/$/, '') + '/api/v3';
    key = apiKey;
  }

  function rawBase() { return base.replace(/\/api\/v3$/, ''); }
  function apiKey() { return key; }

  async function request(path, options = {}) {
    const url = base + path;
    const res = await fetch(url, {
      ...options,
      headers: {
        'X-Api-Key': key,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (e) {}
      throw new Error(`Radarr ${res.status} ${res.statusText} on ${path}${body ? ': ' + body.slice(0, 200) : ''}`);
    }
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    return ct.includes('json') ? res.json() : res.text();
  }

  // Build a poster URL from the movie object's images array (preferred — uses Radarr's own URL)
  function posterUrlFromMovie(movie) {
    const img = (movie.images || []).find(i => i.coverType === 'poster');
    if (!img || !img.url) return null;
    // Radarr returns relative paths like /MediaCover/1/poster.jpg?lastWrite=...
    const path = img.url.startsWith('http') ? img.url : rawBase() + img.url;
    // Append apikey if not already present
    return path + (path.includes('apikey=') ? '' : `${path.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(key)}`);
  }

  // Fallback: build poster URL directly by movie ID (correct Radarr v3 path)
  function posterUrl(movieId, width = 250) {
    return `${rawBase()}/MediaCover/${movieId}/poster.jpg?apikey=${encodeURIComponent(key)}` +
           (width ? `&w=${width}` : '');
  }

  // ── Movies ──────────────────────────────────────────────────────
  const movies = {
    list:  ()              => request('/movie'),
    get:   (id)            => request(`/movie/${id}`),
    add:   (body)          => request('/movie', { method: 'POST', body: JSON.stringify(body) }),
    edit:  (id, body)      => request(`/movie/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    del:   (id, deleteFiles=false) =>
                              request(`/movie/${id}?deleteFiles=${deleteFiles}&addImportExclusion=false`,
                                      { method: 'DELETE' }),
  };

  // ── Queue ────────────────────────────────────────────────────────
  const queue = {
    list: () => request('/queue?includeMovie=true&pageSize=100'),
  };

  // ── Search / Lookup ──────────────────────────────────────────────
  const lookup = {
    search: (term) => request(`/movie/lookup?term=${encodeURIComponent(term)}`),
    tmdb:   (id)   => request(`/movie/lookup/tmdb?tmdbId=${id}`),
  };

  // ── Quality profiles ─────────────────────────────────────────────
  const quality = {
    profiles: () => request('/qualityprofile'),
  };

  // ── Root folders ─────────────────────────────────────────────────
  const rootFolders = {
    list: () => request('/rootfolder'),
  };

  // ── System ───────────────────────────────────────────────────────
  const system = {
    status: () => request('/system/status'),
  };

  // ── Commands (search releases etc) ───────────────────────────────
  const command = {
    post: (body) => request('/command', { method: 'POST', body: JSON.stringify(body) }),
    moviesSearch: (movieIds) => command.post({ name: 'MoviesSearch', movieIds }),
  };

  async function testConnection(url, apiKeyVal) {
    configure(url, apiKeyVal);
    return system.status();
  }

  return {
    configure, testConnection,
    movies, queue, lookup, quality, rootFolders, system, command,
    posterUrl, posterUrlFromMovie, rawBase, apiKey,
  };
})();
