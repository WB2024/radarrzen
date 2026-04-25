// app.js — Router + bootstrap
const App = (() => {
  const screens = {
    setup:   SetupScreen,
    library: LibraryScreen,
    detail:  DetailScreen,
    search:  SearchScreen,
    queue:   QueueScreen,
  };

  let currentTeardown = null;

  function navigate(name, params = {}) {
    if (currentTeardown) { try { currentTeardown(); } catch(e) {} currentTeardown = null; }
    const screen = screens[name];
    if (!screen) { console.error('Unknown screen', name); return; }
    Store.state.currentScreen = name;
    Header.render(name);
    const el = document.getElementById('screen');
    el.innerHTML = '';
    screen.render(el, params);
    if (typeof screen.teardown === 'function') currentTeardown = screen.teardown;
    setTimeout(() => Nav.reset(), 50);
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
    // Register Tizen TV keys
    if (window.tizen && window.tizen.tvinputdevice) {
      const KEYS = ['MediaPlayPause','MediaFastForward','MediaRewind',
                    'ColorF0Red','ColorF1Green','ColorF2Yellow','ColorF3Blue',
                    'ChannelUp','ChannelDown'];
      KEYS.forEach(k => { try { window.tizen.tvinputdevice.registerKey(k); } catch(e) {} });
    }

    Nav.init();
    Nav.setBackHandler(handleBack);

    const ok = Store.loadConfig();
    if (!ok) { navigate('setup'); return; }

    try {
      RadarrAPI.configure(Store.state.config.url, Store.state.config.apiKey, Store.state.config.sawsubeUrl);
      await RadarrAPI.system.status();
      await loadInitialData();
      navigate('library');
    } catch (e) {
      Toast.show('Cannot reach Radarr — check settings', 'error');
      navigate('setup');
    }
  }

  function handleBack() {
    // If a modal is open, the focus scope handles itself; cancel button equivalent
    const modal = document.querySelector('#modal-root .modal-backdrop');
    if (modal) {
      // Try to find a Cancel button
      const cancel = modal.querySelector('[id$="-cancel"]');
      if (cancel) cancel.click();
      else { document.getElementById('modal-root').innerHTML = ''; Nav.clearScope(); }
      return;
    }
    const cur = Store.state.currentScreen;
    if (cur === 'detail' || cur === 'search' || cur === 'queue') {
      navigate('library');
      return;
    }
    if (cur === 'library') {
      // At root — Tizen will exit if not handled. On TV, leave default.
      try { if (window.tizen && window.tizen.application) window.tizen.application.getCurrentApplication().exit(); } catch(e) {}
    }
  }

  return { navigate, boot, loadInitialData };
})();

document.addEventListener('DOMContentLoaded', App.boot);
