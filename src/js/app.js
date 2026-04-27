// app.js — Router + bootstrap (Tizen-optimized)
const App = (() => {
  const screens = {
    setup:   typeof SetupScreen   !== 'undefined' ? SetupScreen   : null,
    library: typeof LibraryScreen !== 'undefined' ? LibraryScreen : null,
    detail:  typeof DetailScreen  !== 'undefined' ? DetailScreen  : null,
    search:  typeof SearchScreen  !== 'undefined' ? SearchScreen  : null,
    queue:   typeof QueueScreen   !== 'undefined' ? QueueScreen   : null,
  };

  let currentTeardown = null;

  function navigate(name, params) {
    params = params || {};
    if (currentTeardown) { try { currentTeardown(); } catch (e) {} currentTeardown = null; }
    const screen = screens[name];
    if (!screen) { console.error('Unknown screen', name); return; }
    Store.state.currentScreen = name;
    Header.render(name);
    const el = document.getElementById('screen');
    el.innerHTML = '';
    Nav.invalidateCache();
    screen.render(el, params);
    if (typeof screen.teardown === 'function') currentTeardown = screen.teardown;
    // Defer Nav reset so screen DOM is laid out
    setTimeout(() => Nav.invalidateCache(), 30);
  }

  async function loadInitialData() {
    try {
      const [profiles, folders] = await Promise.all([
        RadarrAPI.quality.profiles(),
        RadarrAPI.rootFolders.list(),
      ]);
      Store.state.qualityProfiles = profiles || [];
      Store.state.rootFolders = folders || [];
    } catch (e) {
      console.warn('Failed to preload profiles/folders', e);
    }
  }

  async function boot() {
    if (window.tizen && window.tizen.tvinputdevice) {
      const KEYS = ['MediaPlayPause','MediaFastForward','MediaRewind',
                    'ColorF0Red','ColorF1Green','ColorF2Yellow','ColorF3Blue',
                    'ChannelUp','ChannelDown'];
      KEYS.forEach(k => { try { window.tizen.tvinputdevice.registerKey(k); } catch (e) {} });
    }

    Nav.init();
    Nav.setBackHandler(handleBack);

    const ok = Store.loadConfig();
    if (!ok) { navigate('setup'); return; }

    RadarrAPI.configure(Store.state.config.url, Store.state.config.apiKey, Store.state.config.sawsubeUrl);

    // Preload movie cache from localStorage so library renders instantly
    Store.loadMoviesCache();

    // Skip pre-flight status check when we have cached data — trust + verify in background.
    // Speeds boot dramatically on Tizen (no waiting on Radarr round-trip).
    if (Store.state.movies.length > 0) {
      navigate('library');
      // Background: load profiles/folders + verify connection
      loadInitialData().catch(() => {});
      RadarrAPI.system.status().catch(() => {
        Toast.show('Cannot reach Radarr — check settings', 'error');
      });
    } else {
      try {
        await RadarrAPI.system.status();
        await loadInitialData();
        navigate('library');
      } catch (e) {
        Toast.show('Cannot reach Radarr — check settings', 'error');
        navigate('setup');
      }
    }
  }

  function handleBack() {
    const modal = document.querySelector('#modal-root .modal-backdrop');
    if (modal) {
      const cancel = modal.querySelector('[id$="-cancel"]') || modal.querySelector('[id$="-close"]');
      if (cancel) cancel.click();
      else { document.getElementById('modal-root').innerHTML = ''; Nav.clearScope(); }
      return;
    }
    const cur = Store.state.currentScreen;
    if (cur === 'setup' && Store.state.config) {
      navigate('library');
      return;
    }
    if (cur === 'detail' || cur === 'search' || cur === 'queue') {
      navigate('library');
      return;
    }
    if (cur === 'library') {
      try { if (window.tizen && window.tizen.application) window.tizen.application.getCurrentApplication().exit(); } catch (e) {}
    }
  }

  return { navigate, boot, loadInitialData };
})();

document.addEventListener('DOMContentLoaded', App.boot);
