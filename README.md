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
- Approximate hand score, Plasma Deck balancing and Stake-aware blind targets,
  worked out from the deck as card types: enhanced cards, retriggers, cards
  held in hand and Blueprint/Brainstorm copies all count.
- The boss blind of the current ante, with the board scored against its
  effects and its own target.
- Money over the next two antes: blind rewards, spare hands, interest and
  income jokers, which is what purchases are priced against.
- Shop discounts from Clearance Sale, Liquidation and Astronomer.
- Reading a screenshot of the shop or a pack: which cards are on offer, which
  jokers you already hold, the price on each tag, and the money, reroll cost,
  hands, discards, ante and round from the status column. Everything read is
  shown for confirmation before any of it reaches the run.
- A local log of the advice against what you did, summarised on the History
  tab and exportable as JSON for calibrating the weights.
- Local run history, persistent shop/pack drafts and complete transaction undo.
- Ending a run without a result, for when you restart rather than finish, and
  clearing the run history outright.

Routine input is deliberately small: money, the cards on offer, and one
declared hand per run — and a screenshot can supply all but the declared hand.
Hand levels, per-round resources and deck composition are booked from the
planets, vouchers and consumables you record, and the Corrections section
exists only for when a run drifts from what was recorded.

## Current limitations

- Shop and run state are entered by hand or read from a screenshot; the app
  does not read Balatro saves.
- A screenshot is matched against 281 card drawings by perceptual fingerprint.
  Cards under an overlay ("Upgrade!", "Sell $1") are not read, a **Negative
  joker is not recognised** at all because the game redraws it dark, and the
  reference table is built from the English artwork. A joker's edition is not
  read from the picture; on a shop card it is taken from the price tag when the
  surcharge names exactly one, and a held joker stays base until you set it.
  In a shop the hands and discards on display are the next round's allowance,
  which is what the run tracks; a screenshot taken mid-round would show what is
  left of that round instead. See
  [`docs/superpowers/specs/2026-09-21-screenshot-recognition-design.md`](docs/superpowers/specs/2026-09-21-screenshot-recognition-design.md).
- Ratings and synergy tags are curated heuristics, not win-rate-trained values.
- Score contribution is modeled for 65 of the 150 Jokers, and seven more are
  valued by how much more often they make your hand come together (Four
  Fingers, Shortcut, Smeared Joker, Juggler, Turtle Bean, Drunkard, Merry
  Andy): flat effects,
  per-card and held-card effects, retriggers, copies, listed chances and
  effects that scale with something the run tracks. Ranks are assumed evenly
  spread within the face and non-face cards, since only the face count is
  tracked, and the estimate assumes you play only the scoring cards. Jokers that
  scale over time or depend on what was played before are named but excluded.
  Copy jokers are ranked on their rating, since what they will copy over a run
  is not on today's board.
- Income is counted for nine jokers (Golden Joker, To the Moon, Rocket and
  others) and valued in dollars over the horizon instead of their rating.
- Vouchers are being moved off the rating one group at a time. Director's Cut,
  Retcon, Grabber and Nacho Tong are valued from how close your board gets to
  clearing the ante's blinds; Seed Money, Money Tree, Clearance Sale and
  Liquidation from what they add or save with your bankroll held steady;
  Antimatter as the joker it keeps on a full board; Reroll Surplus, Reroll
  Glut, Overstock and Overstock Plus from how often you reroll, counted from
  the reroll price on your shop screenshots once five shops are in; Wasteful,
  Recyclomancy, Paint Brush and Palette from how much more often your declared
  hand comes together; Hieroglyph and Petroglyph as three more rounds of pay
  against the hand or discard they cost for the rest of the run; Blank at
  nothing. Antimatter with slots free counts from when your own buying pace
  fills the board. The other 12, mostly vouchers that change which cards
  turn up, are valued from their rating on a curve that is zero for a voucher
  that does nothing and whose scale is fitted to the modelled ones
  (`scripts/calibrate-voucher-prior.mjs`).
- How likely a hand is to come together is simulated from the deck, the hand
  size and the discards (`src/engine/handOdds.ts`), with a plain
  keep-and-discard strategy, so the odds are a floor. Card values use it: a
  joker that only fires on your Flush counts as often as a Flush turns up.
  Hands that need several copies of a rank (Four and Five of a Kind, Flush
  House, Flush Five) are taken to come together, since the deck profile does
  not track rank copies. The score shown on the run screen is still the made
  hand's.
  See
  [`docs/superpowers/specs/2026-09-25-hand-odds-design.md`](docs/superpowers/specs/2026-09-25-hand-odds-design.md). See
  [`docs/superpowers/specs/2026-09-25-voucher-models-design.md`](docs/superpowers/specs/2026-09-25-voucher-models-design.md).
- Ratings and the score model both estimate a score contribution, so they are
  blended on equal footing, but the weights behind the rating half
  (`topShareOfTarget`, `ratingCurve`, `minBaselineShare`, `dollarsPerDoubling`)
  are judgement calls, not values trained on played runs. See
  [`docs/superpowers/specs/2026-09-17-marginal-prior-design.md`](docs/superpowers/specs/2026-09-17-marginal-prior-design.md).
- The money projection assumes you bank everything inside the horizon. It does
  not know what you will spend on later.
- Boss effects are modeled where the estimate can express them (debuffs, size,
  The Flint, The Arm, The Manacle, The Needle, The Water). Face-down cards,
  The Hook, The Pillar and similar are named but not simulated. Tags,
  playing-card seals and editions are not tracked.
- Perishable remaining rounds are not counted; the sticker is treated as a
  general flexibility penalty.
- Jokers that scale with hands played since acquisition (Green Joker, Ice
  Cream) are rated on their base value only. Supernova and Obelisk are nudged
  by whether you declared a hand, not by how often you played it.
- Unusual card-price modifiers (Couponed tags and the like) may require
  correcting the displayed card price manually.

Use the ranking as a checklist and explanation aid. Your knowledge of the
current blind and run still wins when the model lacks context.

## Develop

Node.js 24 is used in CI. The supported local range is Node 20.19 through 26.

```sh
npm ci
npm run dev
npm run lint
npm test
npm run test:e2e
npm run build
```

CI runs ESLint, then catalog validation, then the tests, then the production
build — which itself revalidates the catalog and runs strict TypeScript checking
before Vite — and finally the Playwright smoke test against the built output. Tests cover
catalog integrity, persistence migrations, game rules, recommendation behavior
and the main UI flows, plus a 300-scenario engine baseline that turns any change
to shared machinery into a reviewable diff rather than a silent shift. The
Playwright suite covers what jsdom cannot: that the built app boots in a real
browser, that a run survives an actual reload, and that it still works offline.

`npm run test:e2e` downloads its own browser by default; set
`PLAYWRIGHT_CHROMIUM_PATH` to reuse one that is already installed.

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
- `src/vision/` — screenshot reading: card detection, fingerprint matching and
  the pixel-font reader for prices and the status column.
- `src/i18n/` — English and German UI wording behind a language switch.
- `e2e/` — Playwright smoke tests against the production build.

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

The design of the card-type score model, bosses, projection and the advice log
is in
[`docs/superpowers/specs/2026-09-24-model-economy-log-design.md`](docs/superpowers/specs/2026-09-24-model-economy-log-design.md).
The advice log (History tab, **Export JSON**) is the raw material for checking
those weights against real runs.

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

## Language

The interface is available in English and German, picked from the browser and
changeable from the switch in the header. Joker, voucher, deck and poker hand
names stay in English in both, because those are the words Balatro itself puts
on screen.

Advice text generated by the engine is English only. Those sentences are built
by interpolating game terms across six engine modules, so translating them is a
separate piece of work from a wording pass.

## Privacy

Bal-Track has no backend or analytics. Run data, including the advice log,
stays in the browser's local storage until you export it yourself, and the
static app remains usable offline after its first successful load. A screenshot
is decoded and matched in a web worker on the device; it is never uploaded, and
nothing of it is kept once the reading is confirmed or discarded.

## License

Bal-Track's original application code and original project material are
licensed under the [MIT License](LICENSE), copyright 2026 fmnznr.

Balatro content and third-party material are not covered by that license. See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for scope, attribution and
the licenses that continue to apply to source material.
