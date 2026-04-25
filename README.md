# Radarrzen

A **TV-native Radarr client** for Samsung Tizen TVs. Browse your movie library, search for new films, and check download status — all from your couch with the TV remote.

> Radarrzen is to Radarr what the Netflix TV app is to Netflix's web admin panel. Same data, completely different interface.

## What it does

- Connects to your existing [Radarr](https://radarr.video) instance via its REST API v3
- D-pad-driven UI designed for sitting 2–3 m from a 1080p+ screen
- Library browser with filter (All / Downloaded / Missing / Monitored) and sort
- Movie detail with Search Releases / Monitor / Delete actions
- Add new movies via TMDB lookup
- Live download queue with progress bars
- Distributed as a signed Tizen `.wgt`, installable via [SAWSUBE](https://github.com/WB2024/SAWSUBE) or `sdb`/`tizen install`

## Requirements

- A running Radarr instance reachable from the TV's network
- Samsung Tizen 4.0+ TV (target: Tizen 7.0 / 2022 models, e.g. QExxLS03B)
- For local builds: [Tizen Studio CLI](https://developer.tizen.org/development/tizen-studio/download) and a signing certificate profile

## Quick start (development)

```bash
# Serve in a desktop browser
cd radarrzen
python3 -m http.server 8080 --directory src
# open http://localhost:8080 at 1920×1080
```

In Setup screen:
- **URL**: `http://<your-radarr>:7878`
- **API key**: from Radarr → Settings → General → API Key

## Build a WGT for the TV

```bash
# Just package
./build.sh

# Package + install to TV at 192.168.1.202 using SAWSUBE cert profile
./build.sh 192.168.1.202 SAWSUBE
```

## CI

Push a tag `vX.Y.Z` to trigger `.github/workflows/release.yml`, which builds and signs the WGT and attaches `Radarrzen.wgt` to a GitHub Release.

Required GitHub repository secrets:

| Secret | Value |
|---|---|
| `TIZEN_CERT_P12` | base64-encoded `.p12` distributor certificate |
| `TIZEN_CERT_PASS` | password for that `.p12` |

## SAWSUBE integration

SAWSUBE's `CURATED_APPS` list includes Radarrzen by default — it auto-fetches the latest WGT from this repo's GitHub Releases and installs to your TV with one click from the SAWSUBE Apps tab.

## Architecture

- Vanilla JS (no bundler), IIFE module pattern, plain HTML/CSS
- `src/js/nav.js` — spatial D-pad focus engine
- `src/js/api.js` — Radarr API v3 client
- `src/js/screens/` — setup / library / detail / search / queue
- `src/css/app.css` — single stylesheet

No NPM dependencies in the runtime.

## Licence

MIT. Radarr is GPL-3.0; this client makes only public REST API calls and incorporates no Radarr source code.
