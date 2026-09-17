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

Recommendations are ranked on one quantity: the estimated multiplier on your
hand score, after the dollars the action gives up. Buying nothing is exactly
1.0, so "+40% score, costs $8" is a claim you can check against your own reading
of the board — and disagree with.

## What it tracks

- All 150 Jokers, 32 Vouchers, 52 consumables and 15 booster variants.
- Deck and cumulative Stake starting rules, including high-Stake Joker stickers.
- Interest thresholds, Green Deck's no-interest economy and Rental upkeep.
- Joker slots, editions, Eternal/Perishable/Rental stickers and sell values.
- Strategy direction from Joker tags, deck profile and the hand you build around.
- Suit, face-card and enhancement counts with common consumable effects, which
  feed the score estimate rather than only the heuristics.
- Joker trigger order, with a safe one-tap reorder suggestion.
- Approximate hand score, Plasma Deck balancing and Stake-aware blind targets.
- Local run history, persistent shop/pack drafts and complete transaction undo.

Routine input is deliberately small: money, the cards on offer, and one
declared hand per run. Hand levels, per-round resources and deck composition
are booked from the planets, vouchers and consumables you record, and the
Corrections section exists only for when a run drifts from what was recorded.

## Current limitations

- Shop and run state are entered manually; the app does not read Balatro saves.
- Ratings and synergy tags are curated heuristics, not win-rate-trained values.
- Exact score contribution is modeled for 40 of the 150 Jokers: flat effects,
  effects that repeat per scoring card of a suit, face or rank, and effects that
  scale with something the run tracks (money, discards, deck size, enhanced
  cards). Rank shares assume ranks are evenly spread, since rank composition is
  not tracked. Random, copy, retrigger, held-in-hand and time-scaling effects
  are named but deliberately excluded from the numeric estimate.
- Ratings and the score model both estimate a score contribution, so they are
  blended on equal footing, but the weights behind the rating half
  (`topShareOfTarget`, `ratingCurve`, `minBaselineShare`, `dollarsPerDoubling`)
  are judgement calls, not values trained on played runs. See
  [`docs/superpowers/specs/2026-09-17-marginal-prior-design.md`](docs/superpowers/specs/2026-09-17-marginal-prior-design.md).
- The ranking prices one shop visit at a time. It does not model how an economy
  build compounds, so a plan changes the advisor's reasons but not its numbers.
- Boss-specific effects, tags, playing-card seals and exact card-by-card scoring
  are not simulated.
- Perishable remaining rounds are not counted; the sticker is treated as a
  general flexibility penalty.
- Jokers that scale with hands played since acquisition (Green Joker, Ice
  Cream) are rated on their base value only. Supernova and Obelisk are nudged
  by whether you declared a hand, not by how often you played it.
- Unusual card-price modifiers may require correcting the displayed card price
  manually. Pack and voucher discounts are not modeled yet.

Use the ranking as a checklist and explanation aid. Your knowledge of the
current blind and run still wins when the model lacks context.

## Develop

Node.js 24 is used in CI. The supported local range is Node 20.19 through 26.

```sh
npm ci
npm run dev
npm run lint
npm test
npm run build
```

CI runs ESLint, then the tests, then the production build, which itself runs
strict TypeScript checking before Vite. Tests cover
catalog integrity, persistence migrations, game rules, recommendation behavior
and the main UI flows, plus a 300-scenario engine baseline that turns any change
to shared machinery into a reviewable diff rather than a silent shift.

## Deploy

Pushes to `main` are tested, built and deployed to GitHub Pages. Pull requests
run the same test and production-build gate without deploying. Any other static
HTTPS host can serve the contents of `dist/`; HTTPS is required for the service
worker.

## Architecture

- `src/data/` — catalog data and structural validation tests.
- `src/catalog/` — typed catalog lookups and the autocomplete search index.
- `src/engine/` — pure recommendation, strategy, economy and scoring rules.
- `src/engine/impact.ts` — the one axis every card is ranked on.
- `src/engine/tuning.ts` — every tunable heuristic weight, in one annotated table.
- `src/run/` — versioned local persistence and the transactional reducer.
- `src/ui/` — mobile-first React screens and reusable controls.

Keeping the engine pure makes recommendation scenarios easy to regression-test
without rendering the UI.

## Data and calibration

Every card is ranked by its estimated effect on your hand score, with costs held
in dollars and converted once through a single stated exchange rate. Both the
score model and the catalog ratings estimate that effect as a score
contribution, measured against a baseline floored at a share of the blind you
are building toward and capped at the final blind of a run. The design and its
known weaknesses are in
[`docs/superpowers/specs/2026-09-17-score-multiplier-scale-design.md`](docs/superpowers/specs/2026-09-17-score-multiplier-scale-design.md)
and
[`docs/superpowers/specs/2026-09-17-marginal-prior-design.md`](docs/superpowers/specs/2026-09-17-marginal-prior-design.md).

Heuristic weights live in [`src/engine/tuning.ts`](src/engine/tuning.ts), separate
from the game rules in `gameRules.ts`, `economy.ts` and `score.ts`. A game rule is
right or wrong; a tuning weight is a judgement call about desirability. Change a
weight there and prove the new behaviour in the scenario tests — the tuning tests
only guard the table's shape, not whether a value is strategically sound.

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
