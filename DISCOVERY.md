# Radarrzen — Discovery Feature Spec

## Overview

Two linked features that surface new movie recommendations using The Movie Database (TMDB) API:

1. **Similar Movies** — a "You might also like" section at the bottom of every detail page, based on the currently-viewed movie.
2. **Discover Screen** — a dedicated screen (new header tab) showing trending movies, top-rated movies, and genre-filtered recommendations, all filtered to exclude titles already in your library.

Both features call TMDB directly from the Tizen app (CORS is permitted). No SAWSUBE dependency. No extra network hop.

---

## API: The Movie Database (TMDB)

**API key**: baked at build time into `src/js/tmdb.js` (or injected via `sawsube-config.js` at SAWSUBE install time).

**Base URL**: `https://api.themoviedb.org/3`  
**Auth**: `?api_key=KEY` query param  
**CORS**: ✅ Allowed from browser origins — tested live  
**Image base**: `https://image.tmdb.org/t/p/w300{poster_path}` (no auth)

### Endpoints used

| Purpose | Endpoint |
|---|---|
| Movie recommendations | `GET /movie/{tmdb_id}/recommendations` |
| Movie similar | `GET /movie/{tmdb_id}/similar` |
| Trending (week) | `GET /trending/movie/week` |
| Top rated | `GET /movie/top_rated` |
| Discover by genre | `GET /discover/movie?with_genres={id}&sort_by=vote_average.desc&vote_count.gte=200` |
| Genre list | `GET /genre/movie/list` |

All responses return up to 20 results per page with a `results[]` array containing: `id` (TMDB id), `title`, `release_date`, `overview`, `poster_path`, `vote_average`, `genre_ids`.

### Why TMDB and not a different source

Radarr uses TMDB as its metadata provider and stores `tmdbId` on every movie. This means:
- No ID translation required — use `movie.tmdbId` directly.
- Results from TMDB recommendations match exactly what Radarr can add.
- De-duplication against the library is trivial: `Store.state.movies.find(m => m.tmdbId === result.id)`.

---

## Feature 1: Similar Movies on Detail Page

### Behaviour

- After the detail page renders (shell + enriched), fetch `GET /movie/{tmdb_id}/recommendations`.
- Render a horizontal scrollable rail of poster cards below the existing detail content (below the stats `<dl>`).
- Each card shows: poster image, title, year, TMDB rating.
- Navigating to a card with OK:
  - If the movie is **already in the library**: navigate directly to its detail page.
  - If the movie is **not in the library**: open the same "Add Movie" overlay used by the search screen (quality profile + root folder picker → add → navigate to new movie's detail page).
- If the API call fails or returns zero results, the rail is silently hidden (no error shown to user).

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [poster]  [detail info + actions]                              │
│            ── existing detail top ──                            │
├─────────────────────────────────────────────────────────────────┤
│  You might also like                                            │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                 │
│  │      │ │      │ │      │ │      │ │      │  ←→ scroll       │
│  │poster│ │poster│ │poster│ │poster│ │poster│                  │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                 │
│  Title     Title    Title    Title    Title                     │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation plan

**New file**: `src/js/tmdb.js`

```js
const TMDB = (() => {
  const BASE = 'https://api.themoviedb.org/3';
  const KEY  = typeof TMDB_API_KEY !== 'undefined' ? TMDB_API_KEY : '';
  const IMG  = 'https://image.tmdb.org/t/p/w300';

  function get(path) {
    const sep = path.indexOf('?') >= 0 ? '&' : '?';
    return fetch(BASE + path + sep + 'api_key=' + KEY)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('TMDB ' + r.status)));
  }

  function posterUrl(poster_path) {
    return poster_path ? IMG + poster_path : null;
  }

  const movies = {
    recommendations: (tmdbId) => get('/movie/' + tmdbId + '/recommendations'),
    similar:         (tmdbId) => get('/movie/' + tmdbId + '/similar'),
    trending:        ()       => get('/trending/movie/week'),
    topRated:        ()       => get('/movie/top_rated'),
    discover:        (genreId, page) => get('/discover/movie?with_genres=' + genreId + '&sort_by=vote_average.desc&vote_count.gte=200&page=' + (page || 1)),
    genres:          ()       => get('/genre/movie/list'),
  };

  return { movies, posterUrl };
})();
```

**API key injection** — two options:
- **Option A** (standalone): add `const TMDB_API_KEY = '...';` to `src/js/sawsube-config.js` at build time (same pattern as Radarr URL injection).
- **Option B** (manual): user enters TMDB API key in the Setup screen (stored in `radarrzen-config` localStorage). Better for public distribution but adds a setup step.

Recommendation: **Option A** for now — bake at build time via `build.sh` accepting `TMDB_API_KEY` env var.

**Modification to `src/js/screens/detail.js`**:

1. After `enrichDetail()` call succeeds, also call `loadSimilar(m.tmdbId)`.
2. `loadSimilar(tmdbId)` function:
   - Creates a `<section class="similar-rail">` with an `<h2>You might also like</h2>` and a horizontal scroll container.
   - Calls `TMDB.movies.recommendations(tmdbId)`.
   - On success: renders up to 10 poster cards (same card structure as search results).
   - On failure: removes the section silently.
3. Each card's click handler:
   - Check `Store.state.movies.find(m => m.tmdbId === result.id)` → if found, `App.navigate('detail', { movieId: found.id })`.
   - If not found: call `openAddOverlay(result)` — **reuse the exact same function from search.js** (extract it to a shared module or duplicate it).

**Shared add overlay** — to avoid duplicating `openAddOverlay()`:
- Move `openAddOverlay()` and `buildPickerDropdown()` out of `search.js` into a new `src/js/components/addmovie.js`.
- Both `search.js` and `detail.js` call `AddMovieOverlay.open(result)`.

**Nav focus**: the rail cards are `data-nav` elements. After the rail renders, call `Nav.invalidateCache()`. Focus does not auto-jump to the rail — user must arrow-down from the action buttons.

---

## Feature 2: Discover Screen

### Behaviour

- New header tab: **Discover** (between Queue and Settings).
- Screen has two sections displayed vertically:
  1. **Trending This Week** — `GET /trending/movie/week`, shows top 20, filtered to exclude library items.
  2. **Genre rows** — loads the TMDB genre list once per session (cached in `sessionStorage`), displays a horizontal list of genre buttons. When a genre is focused + selected, replaces the lower half of the screen with a grid of that genre's top-rated films (filtered to exclude library).

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  🎬 Radarr  Library  Search  Queue  Discover  Settings          │
├─────────────────────────────────────────────────────────────────┤
│  Trending This Week                                             │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  (rail)         │
│  │      │ │      │ │      │ │      │ │      │                  │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                 │
├─────────────────────────────────────────────────────────────────┤
│  Browse by Genre                                                │
│  [Action] [Comedy] [Drama] [Horror] [Sci-Fi] [Thriller] ...     │
│                                                                 │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  (grid, shown on select) │
│  │      │ │      │ │      │ │      │                           │
│  └──────┘ └──────┘ └──────┘ └──────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

### New file: `src/js/screens/discover.js`

```js
const DiscoverScreen = (() => {
  // Cache genre list for session (avoid re-fetching on every visit)
  let _genres = null;

  function render(host) {
    host.innerHTML = '';
    // ... build DOM, fetch trending, fetch genre list
  }

  function isInLibrary(tmdbId) {
    return !!Store.state.movies.find(m => m.tmdbId === tmdbId);
  }

  function renderRail(container, results) {
    // horizontal scroll, poster cards, same pattern as similar rail in detail.js
  }

  function renderGenreGrid(container, genreId) {
    // TMDB.movies.discover(genreId) → filter → render poster grid
  }

  return { render };
})();
```

### De-duplication logic

All results are filtered before rendering:

```js
const notInLibrary = results.filter(r => !isInLibrary(r.id));
```

`r.id` in TMDB results is the TMDB movie ID. `Store.state.movies[].tmdbId` is stored from Radarr.  
Already-in-library items are silently excluded. If this leaves very few results, the section notes "X already in your library".

### Genre session cache

```js
async function getGenres() {
  if (_genres) return _genres;
  try {
    const raw = sessionStorage.getItem('rz-tmdb-genres');
    if (raw) { _genres = JSON.parse(raw); return _genres; }
  } catch (e) {}
  const data = await TMDB.movies.genres();
  _genres = data.genres || [];
  try { sessionStorage.setItem('rz-tmdb-genres', JSON.stringify(_genres)); } catch (e) {}
  return _genres;
}
```

Genres are fetched once per session, not persisted to localStorage (they rarely change, and stale data is harmless).

---

## Changes to Existing Files

### `src/js/components/header.js`

Add `{ id: 'discover', label: 'Discover' }` between Queue and Settings in the TABS array.

### `src/js/app.js`

Register `DiscoverScreen` in the `screens` object. Add `'discover'` to `handleBack` (back returns to library).

### `src/index.html`

Add `<script src="js/tmdb.js"></script>` and `<script src="js/screens/discover.js"></script>` before `app.js`.  
If extracting add overlay: also `<script src="js/components/addmovie.js"></script>`.

---

## Build-time API Key Injection

Modify `build.sh` to accept and inject `TMDB_API_KEY`:

```bash
TMDB_KEY="${TMDB_API_KEY:-}"
sed -i "s|__TMDB_API_KEY__|${TMDB_KEY}|g" "$SRC_DIR/js/sawsube-config.js"
```

`sawsube-config.js` template line:
```js
var TMDB_API_KEY = '__TMDB_API_KEY__';
```

SAWSUBE can also inject this from its `.env` `TMDB_API_KEY` value during `inject_app_config()`.

---

## Implementation Phases

### Phase 1 — Similar movies on detail page *(lower risk, immediate value)*
- [ ] Create `src/js/tmdb.js`
- [ ] Add build-time TMDB key injection to `build.sh`
- [ ] Add `loadSimilar()` to `detail.js`
- [ ] Add "You might also like" rail DOM + nav
- [ ] Extract `openAddOverlay()` to `src/js/components/addmovie.js`

### Phase 2 — Discover screen
- [ ] Create `src/js/screens/discover.js`
- [ ] Add Discover tab to header
- [ ] Register screen in `app.js`
- [ ] Add script tags to `index.html`
- [ ] Test genre filtering, de-duplication, TV rail navigation on Tizen

### Phase 3 — Library-aware genre personalisation *(optional enhancement)*
- Add `genreIds: []` to `slimMovie()` in `store.js` (from Radarr movie's `genres[]` strings, mapped to TMDB IDs using cached genre list).
- On Discover page load, analyse library genres → auto-select the top 3 genres → pre-render those genre sections first.
- Only fetch genre mapping once per session.

---

## Tizen Compatibility Notes

- **CORS**: TMDB API returns `Access-Control-Allow-Origin: *`. ✅ Tested.
- **HTTPS**: Tizen WebView allows HTTPS outbound. TMDB and image CDN both HTTPS. ✅
- **`fetch`**: Available on Tizen 6.5. ✅
- **`sessionStorage`**: Available. ✅
- **Poster images**: `https://image.tmdb.org/t/p/w300{path}` — public CDN, no auth, loads fine in `<img>` tags. ✅
- **Grid size**: Cap discovery grid at 20 items. Cap similar rail at 10. Avoid large DOM on Tizen.
- **Focus after async load**: Call `Nav.invalidateCache()` after every dynamic render. Defer `Nav.focus()` with `setTimeout(..., 30)`.

---

## Security Notes

- TMDB API key is embedded in client-side JS — acceptable for a self-hosted personal TV app with no public internet exposure.
- Never commit API keys to git. The `sawsube-config.js` (which holds the injected key) is already in `.gitignore` (verify this). The template in the repo should use a placeholder.
- All external requests are read-only GET calls. No user data is sent to TMDB.
