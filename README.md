# Bal-Track — Balatro Shop Advisor

A mobile-first PWA that acts as a second-screen advisor for Balatro runs on
platforms without mod or save-file access (mobile, Switch, Xbox). You enter
your run state and each shop's contents manually (fast autocomplete over the
full card catalog); the app returns ranked, explained recommendations for
every shop decision — buy/sell/reroll/skip, vouchers, packs, and pack picks.
A strategy advisor on the run screen reads your jokers and deck, names the
build worth committing to (or honestly says "stay flexible"), and feeds the
recommended plan back into shop advice. A semi-automatic deck profile (suit,
face-card and enhancement counts) keeps the advice honest about what your
deck actually contains. It also checks your joker order — jokers trigger
left to right — and can apply a suggested ordering in one tap. Telling it
how often you played each poker hand sharpens the plan further — a flush
build is recognised from your actual hands, not just your jokers. Where a
joker's effect is unambiguous, the app also estimates what your typical hand
scores and how far that is from the ante's blind targets — always labelled
as an estimate, and always naming the jokers it could not count.

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
