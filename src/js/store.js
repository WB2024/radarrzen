// store.js — In-memory state + localStorage persistence
const Store = (() => {
  const STORAGE_KEY = 'radarrzen-config';

  const state = {
    config: null,            // { url, apiKey, sawsubeUrl }
    movies: [],              // cached movie list
    moviesLoadedAt: 0,
    qualityProfiles: [],
    rootFolders: [],
    currentScreen: 'setup',
    selectedMovieId: null,
    libraryView: { filter: 'all', sort: 'title' },
  };

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { state.config = JSON.parse(raw); return true; }
    } catch (e) {}
    return false;
  }

  function saveConfig(url, apiKey, sawsubeUrl) {
    state.config = { url: url.replace(/\/$/, ''), apiKey, sawsubeUrl: (sawsubeUrl || '').replace(/\/$/, '') };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
  }

  function clearConfig() {
    state.config = null;
    state.movies = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  return { state, loadConfig, saveConfig, clearConfig };
})();
