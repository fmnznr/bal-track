# Bal-Track — Balatro Shop Advisor

A mobile-first PWA that acts as a second-screen advisor for Balatro runs on
platforms without mod or save-file access (mobile, Switch, Xbox). You enter
your run state and each shop's contents manually (fast autocomplete over the
full card catalog); the app returns ranked, explained recommendations for
every shop decision — buy/sell/reroll/skip, vouchers, packs, and pack picks.

Recommendations are heuristic: phase-dependent card ratings, synergy tags
matched against your detected build, and interest-aware economy rules. Every
recommendation states its reasons — trust your own judgment when it matters.

## Develop

- `npm install`
- `npm run dev` — dev server
- `npm test` — run the test suite
- `npm run build` — typecheck + production build (`dist/`)

## Deploy

Any static host over HTTPS works (required for the service worker). Upload
the contents of `dist/`.

## Data

Catalog data (`src/data/*.json`) is transcribed from the community wiki;
ratings/tags are hand-curated heuristics — tweak them freely, the validation
tests in `src/data/` keep the structure honest.
