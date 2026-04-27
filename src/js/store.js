// store.js — In-memory state + localStorage persistence (Tizen-optimized)
const Store = (() => {
  const STORAGE_KEY = 'radarrzen-config';
  const MOVIES_KEY = 'radarrzen-movies-v1';
  const MOVIES_TTL = 5 * 60 * 1000;     // 5 min — fresh enough, instant boot

  const state = {
    config: null,
    movies: [],                         // slim subset (see slimMovie below)
    moviesLoadedAt: 0,
    qualityProfiles: [],
    rootFolders: [],
    currentScreen: 'setup',
    selectedMovieId: null,
    libraryView: { filter: 'all', sort: 'title' },
    libraryScrollTop: 0,                // remember scroll when leaving library
    libraryFocusIndex: 0,               // remember focused card index
  };

  // Persist only fields the UI actually uses. Saves ~80% storage + parse time.
  function slimMovie(m) {
    let posterPath = null;
    const imgs = m.images;
    if (imgs) {
      for (let i = 0; i < imgs.length; i++) {
        if (imgs[i].coverType === 'poster') {
          posterPath = imgs[i].remoteUrl || imgs[i].url || null;
          break;
        }
      }
    }
    return {
      id: m.id,
      title: m.title,
      sortTitle: m.sortTitle,
      year: m.year,
      hasFile: !!m.hasFile,
      monitored: !!m.monitored,
      added: m.added,
      tmdbId: m.tmdbId,
      ratings: m.ratings,
      posterUrl: posterPath,
    };
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { state.config = JSON.parse(raw); return true; }
    } catch (e) {}
    return false;
  }

  function saveConfig(url, apiKey, sawsubeUrl) {
    state.config = {
      url: url.replace(/\/$/, ''),
      apiKey: apiKey,
      sawsubeUrl: (sawsubeUrl || '').replace(/\/$/, ''),
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config)); } catch (e) {}
  }

  function clearConfig() {
    state.config = null;
    state.movies = [];
    state.moviesLoadedAt = 0;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(MOVIES_KEY);
    } catch (e) {}
  }

  function loadMoviesCache() {
    try {
      const raw = localStorage.getItem(MOVIES_KEY);
      if (!raw) return false;
      const obj = JSON.parse(raw);
      if (!obj || !obj.t || !obj.m) return false;
      state.movies = obj.m;
      state.moviesLoadedAt = obj.t;
      return true;
    } catch (e) { return false; }
  }

  function saveMoviesCache(movies) {
    const slim = movies.map(slimMovie);
    state.movies = slim;
    state.moviesLoadedAt = Date.now();
    try {
      localStorage.setItem(MOVIES_KEY, JSON.stringify({ t: state.moviesLoadedAt, m: slim }));
    } catch (e) {
      // Quota exceeded — keep in-memory only, prune cache key
      try { localStorage.removeItem(MOVIES_KEY); } catch (_) {}
    }
  }

  function moviesAreFresh() {
    return state.movies.length > 0 && (Date.now() - state.moviesLoadedAt) < MOVIES_TTL;
  }

  return {
    state, loadConfig, saveConfig, clearConfig,
    loadMoviesCache, saveMoviesCache, moviesAreFresh, slimMovie,
  };
})();
