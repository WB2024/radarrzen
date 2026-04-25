// api.js — Radarr REST API v3 client
const RadarrAPI = (() => {
  let base = '', key = '', sawsubeBase = '';

  function configure(url, apiKey, sawsubeUrl) {
    base = url.replace(/\/$/, '') + '/api/v3';
    key = apiKey;
    sawsubeBase = (sawsubeUrl || '').replace(/\/$/, '');
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
  function posterUrl(movieId) {
    return `${rawBase()}/MediaCover/${movieId}/poster.jpg?apikey=${encodeURIComponent(key)}`;
  }

  // Returns a direct <img src> URL via the SAWSUBE proxy with server-side resize + 30-day cache.
  // Since SAWSUBE has CORS allow_origins=*, the browser can use this directly without blob URLs.
  // Only returns a URL when sawsubeBase is configured.
  function posterImgSrc(movie, width = 200) {
    if (!sawsubeBase) return null;
    const raw = posterUrlFromMovie(movie) || posterUrl(movie.id);
    const radarrOrigin = rawBase();
    const pathPart = raw.startsWith(radarrOrigin) ? raw.slice(radarrOrigin.length) : raw;
    return `${sawsubeBase}/api/radarr/image?path=${encodeURIComponent(pathPart)}&w=${width}`;
  }

  // Legacy fetch-to-blob path — used only when sawsubeBase is not configured.
  // With SAWSUBE, prefer posterImgSrc() and set img.src directly (browser handles HTTP caching).
  const _blobCache = new Map();
  async function fetchPoster(posterSrc) {
    if (sawsubeBase) {
      // Shouldn't be called when SAWSUBE is set — use posterImgSrc() instead.
      // But if called, return a direct URL so the browser can cache it.
      const radarrOrigin = rawBase();
      const pathPart = posterSrc.startsWith(radarrOrigin)
        ? posterSrc.slice(radarrOrigin.length)
        : posterSrc;
      return `${sawsubeBase}/api/radarr/image?path=${encodeURIComponent(pathPart)}&w=200`;
    }
    if (_blobCache.has(posterSrc)) return _blobCache.get(posterSrc);
    try {
      const res = await fetch(posterSrc, { headers: { 'X-Api-Key': key } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      _blobCache.set(posterSrc, objectUrl);
      return objectUrl;
    } catch (e) {
      console.warn('[RadarrAPI] fetchPoster failed:', posterSrc, e.message);
      _blobCache.set(posterSrc, null);
      return null;
    }
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

  // ── Releases (interactive search) ────────────────────────────────
  const release = {
    search: (movieId) => request(`/release?movieId=${movieId}`),
    grab:   (body)    => request('/release', { method: 'POST', body: JSON.stringify(body) }),
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
    movies, queue, release, lookup, quality, rootFolders, system, command,
    posterUrl, posterUrlFromMovie, posterImgSrc, fetchPoster, rawBase, apiKey,
  };
})();
