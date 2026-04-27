// tmdb.js — The Movie Database client (no SAWSUBE dep, CORS-friendly).
// API key is injected at build time into sawsube-config.js as TMDB_API_KEY.
// Falls back to localStorage('tmdb-api-key') for manual dev override.
const TMDB = (function () {
  const BASE = 'https://api.themoviedb.org/3';
  const IMG  = 'https://image.tmdb.org/t/p/w300';

  function key() {
    if (typeof TMDB_API_KEY !== 'undefined' && TMDB_API_KEY && TMDB_API_KEY.indexOf('__') !== 0) return TMDB_API_KEY;
    try {
      const k = localStorage.getItem('tmdb-api-key');
      if (k) return k;
    } catch (e) {}
    return '';
  }

  function get(path) {
    const k = key();
    if (!k) return Promise.reject(new Error('TMDB key missing'));
    const sep = path.indexOf('?') >= 0 ? '&' : '?';
    return fetch(BASE + path + sep + 'api_key=' + encodeURIComponent(k))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('TMDB ' + r.status)); });
  }

  function posterUrl(poster_path) { return poster_path ? (IMG + poster_path) : null; }

  // Session-cached genre list
  let _genres = null;
  function genres() {
    if (_genres) return Promise.resolve(_genres);
    try {
      const raw = sessionStorage.getItem('rz-tmdb-genres');
      if (raw) { _genres = JSON.parse(raw); return Promise.resolve(_genres); }
    } catch (e) {}
    return get('/genre/movie/list').then(function (d) {
      _genres = (d && d.genres) || [];
      try { sessionStorage.setItem('rz-tmdb-genres', JSON.stringify(_genres)); } catch (e) {}
      return _genres;
    });
  }

  const movies = {
    recommendations: function (id) { return get('/movie/' + id + '/recommendations'); },
    similar:         function (id) { return get('/movie/' + id + '/similar'); },
    trending:        function ()   { return get('/trending/movie/week'); },
    topRated:        function ()   { return get('/movie/top_rated'); },
    discover:        function (genreId, page) {
      return get('/discover/movie?with_genres=' + genreId + '&sort_by=popularity.desc&vote_count.gte=200&page=' + (page || 1));
    },
  };

  function hasKey() { return !!key(); }

  return { movies, genres, posterUrl, hasKey };
})();
