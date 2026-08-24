# Bal-Track — Balatro Shop Advisor

[![Deploy to GitHub Pages](https://github.com/fmnznr/bal-track/actions/workflows/deploy.yml/badge.svg)](https://github.com/fmnznr/bal-track/actions/workflows/deploy.yml)

**[Open the live app](https://fmnznr.github.io/bal-track/)**

Bal-Track is a mobile-first, offline-capable second-screen advisor for Balatro
runs on platforms without mod or save-file access (mobile, Switch and Xbox).
Enter the current run and shop state manually; the app ranks and explains
buy, sell, reroll, skip, voucher, booster and pack-pick decisions.

The app is intentionally an explainable heuristic advisor, not a deterministic
solver. Every recommendation shows its reasons and labels whether it comes
from modeled mechanics, a partial model or hand-curated heuristics.

## What it tracks

- All 150 Jokers, 32 Vouchers, 52 consumables and 15 booster variants.
- Deck and cumulative Stake starting rules, including high-Stake Joker stickers.
- Interest thresholds, Green Deck's no-interest economy and Rental upkeep.
- Joker slots, editions, Eternal/Perishable/Rental stickers and sell values.
- Strategy direction from Joker tags, deck profile and hands actually played.
- Suit, face-card and enhancement counts with common consumable effects.
- Joker trigger order, with a safe one-tap reorder suggestion.
- Approximate hand score, Plasma Deck balancing and Stake-aware blind targets.
- Local run history, persistent shop/pack drafts and complete transaction undo.

## Current limitations

- Shop and run state are entered manually; the app does not read Balatro saves.
- Ratings and synergy tags are curated heuristics, not win-rate-trained values.
- Exact score contribution is modeled only for unambiguous flat-effect Jokers.
  Conditional, random, copy, retrigger and most scaling effects are named but
  deliberately excluded from the numeric estimate.
- Boss-specific effects, tags, playing-card seals and exact card-by-card scoring
  are not simulated.
- Perishable remaining rounds are not counted; the sticker is treated as a
  general flexibility penalty.
- Unusual card-price modifiers may require correcting the displayed card price
  manually. Pack and voucher discounts are not modeled yet.

Use the ranking as a checklist and explanation aid. Your knowledge of the
current blind and run still wins when the model lacks context.

## Develop

Node.js 24 is used in CI. The supported local range is Node 20.19 through 26.

```sh
npm ci
npm run dev
npm test
npm run build
```

The production build runs strict TypeScript checking before Vite. Tests cover
catalog integrity, persistence migrations, game rules, recommendation behavior
and the main UI flows.

## Deploy

Pushes to `main` are tested, built and deployed to GitHub Pages. Pull requests
run the same test and production-build gate without deploying. Any other static
HTTPS host can serve the contents of `dist/`; HTTPS is required for the service
worker.

## Architecture

- `src/data/` — catalog data and structural validation tests.
- `src/engine/` — pure recommendation, strategy, economy and scoring rules.
- `src/run/` — versioned local persistence and the transactional reducer.
- `src/ui/` — mobile-first React screens and reusable controls.

Keeping the engine pure makes recommendation scenarios easy to regression-test
without rendering the UI.

## Data and calibration

Catalog facts are transcribed from the community-maintained
[Balatro Wiki](https://balatrogame.fandom.com/wiki/Balatro_Wiki). Stake score
curves follow the wiki's [Blinds and Antes](https://balatrogame.fandom.com/wiki/Blinds_and_Antes)
and [Stakes](https://balatrowiki.org/w/Stakes) references. Ratings and tags are
project-owned heuristics and should be changed together with scenario tests.
Detailed attribution and license boundaries are recorded in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

When updating game data, record the Balatro version and source in the commit.
The validation tests protect shape and completeness; they do not prove that a
subjective rating is strategically optimal.

## Privacy

Bal-Track has no backend or analytics. Run data stays in the browser's local
storage and the static app remains usable offline after its first successful
load.

## License

Bal-Track's original application code and original project material are
licensed under the [MIT License](LICENSE), copyright 2026 fmnznr.

Balatro content and third-party material are not covered by that license. See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for scope, attribution and
the licenses that continue to apply to source material.
