// sawsube-config.js — Pre-install config seed.
//
// In the public GitHub release this file is intentionally a no-op so that no
// credentials are committed.  When a user installs via SAWSUBE, this file is
// REPLACED inside the WGT by SAWSUBE's tizenbrew_service.inject_app_config()
// with a snippet that pre-seeds localStorage with their Radarr URL + API key.
//
// For local browser dev, set the config in DevTools:
//   localStorage.setItem('radarrzen-config', JSON.stringify({
//     url: 'http://192.168.1.x:7878',
//     apiKey: 'your-key-here',
//     sawsubeUrl: 'http://localhost:8000'
//   }));
//
// TMDB_API_KEY is replaced at build time by build.sh (sed) when TMDB_API_KEY
// env var is set. Falls back to localStorage('tmdb-api-key') if placeholder.
var TMDB_API_KEY = '__TMDB_API_KEY__';
(function(){})();
