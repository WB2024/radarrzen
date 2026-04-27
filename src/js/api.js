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

  // Direct-from-Radarr poster. No SAWSUBE dependency — images served straight
  // from the Radarr host. Library movies use /MediaCover (already on-disk on
  // the server, fast). Browser HTTP-cache handles repeat loads.
  // width param kept for API compatibility but unused (no resize proxy).
  function posterImgSrc(movie, _width) {
    const raw = posterUrlFromMovie(movie) || posterUrl(movie.id);
    // Append apikey for Radarr-hosted URLs that don't already carry it.
    if (raw.indexOf(rawBase()) === 0 && raw.indexOf('apikey=') < 0) {
      return raw + (raw.indexOf('?') >= 0 ? '&' : '?') + 'apikey=' + encodeURIComponent(key);
    }
    return raw;
  }

  // External image (TMDB etc.) — return URL directly. Browser fetches it.
  // width param kept for API compatibility.
  function remoteImgSrc(url, _width) {
    return url || null;
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
