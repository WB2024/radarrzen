// api.js — Radarr REST API v3 client (Tizen-optimized)
const RadarrAPI = (() => {
  let base = '', key = '', sawsubeBase = '';

  function configure(url, apiKey, sawsubeUrl) {
    base = url.replace(/\/$/, '') + '/api/v3';
    key = apiKey;
    sawsubeBase = (sawsubeUrl || '').replace(/\/$/, '');
  }

  function rawBase() { return base.replace(/\/api\/v3$/, ''); }
  function apiKey() { return key; }
  function hasSawsube() { return !!sawsubeBase; }

  async function request(path, options) {
    const opts = options || {};
    const res = await fetch(base + path, {
      method: opts.method || 'GET',
      body: opts.body,
      headers: {
        'X-Api-Key': key,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (e) {}
      throw new Error('Radarr ' + res.status + ' on ' + path + (body ? ': ' + body.slice(0, 200) : ''));
    }
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    return ct.indexOf('json') >= 0 ? res.json() : res.text();
  }

  function posterUrlFromMovie(movie) {
    if (!movie) return null;
    // Slim cache stores `posterUrl` directly
    if (movie.posterUrl) {
      const u = movie.posterUrl;
      return u.indexOf('http') === 0 ? u : rawBase() + u;
    }
    const imgs = movie.images;
    if (!imgs) return null;
    for (let i = 0; i < imgs.length; i++) {
      if (imgs[i].coverType === 'poster' && imgs[i].url) {
        const u = imgs[i].url;
        return u.indexOf('http') === 0 ? u : rawBase() + u;
      }
    }
    return null;
  }

  function posterUrl(movieId) {
    return rawBase() + '/MediaCover/' + movieId + '/poster.jpg?apikey=' + encodeURIComponent(key);
  }

  // Resized poster via SAWSUBE proxy. Browser HTTP-caches (Cache-Control 30d).
  function posterImgSrc(movie, width) {
    const w = width || 200;
    if (!sawsubeBase) {
      const raw = posterUrlFromMovie(movie) || posterUrl(movie.id);
      return raw + (raw.indexOf('apikey=') >= 0 ? '' : (raw.indexOf('?') >= 0 ? '&' : '?') + 'apikey=' + encodeURIComponent(key));
    }
    const raw = posterUrlFromMovie(movie) || posterUrl(movie.id);
    const radarrOrigin = rawBase();
    const pathPart = raw.indexOf(radarrOrigin) === 0 ? raw.slice(radarrOrigin.length) : raw;
    return sawsubeBase + '/api/radarr/image?path=' + encodeURIComponent(pathPart) + '&w=' + w;
  }

  // Proxy any remote image (e.g. TMDB) for resize + cache.
  function remoteImgSrc(url, width) {
    if (!url) return null;
    if (!sawsubeBase) return url;
    const w = width || 200;
    return sawsubeBase + '/api/radarr/image?url=' + encodeURIComponent(url) + '&w=' + w;
  }

  const movies = {
    list:  ()              => request('/movie'),
    get:   (id)            => request('/movie/' + id),
    add:   (body)          => request('/movie', { method: 'POST', body: JSON.stringify(body) }),
    edit:  (id, body)      => request('/movie/' + id, { method: 'PUT', body: JSON.stringify(body) }),
    del:   (id, deleteFiles) =>
                              request('/movie/' + id + '?deleteFiles=' + (deleteFiles ? 'true' : 'false') + '&addImportExclusion=false',
                                      { method: 'DELETE' }),
  };

  const queue = { list: () => request('/queue?includeMovie=true&pageSize=100') };
  const release = {
    search: (movieId) => request('/release?movieId=' + movieId),
    grab:   (body)    => request('/release', { method: 'POST', body: JSON.stringify(body) }),
  };
  const lookup = {
    search: (term) => request('/movie/lookup?term=' + encodeURIComponent(term)),
    tmdb:   (id)   => request('/movie/lookup/tmdb?tmdbId=' + id),
  };
  const quality = { profiles: () => request('/qualityprofile') };
  const rootFolders = { list: () => request('/rootfolder') };
  const system = { status: () => request('/system/status') };
  const command = {
    post: (body) => request('/command', { method: 'POST', body: JSON.stringify(body) }),
    moviesSearch: (movieIds) => command.post({ name: 'MoviesSearch', movieIds: movieIds }),
  };

  async function testConnection(url, apiKeyVal) {
    configure(url, apiKeyVal);
    return system.status();
  }

  return {
    configure, testConnection,
    movies, queue, release, lookup, quality, rootFolders, system, command,
    posterUrl, posterUrlFromMovie, posterImgSrc, remoteImgSrc,
    rawBase, apiKey, hasSawsube,
  };
})();
