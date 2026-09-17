# One scale: the estimated score multiplier

Replaces the additive 0-10 ranking that
[`2026-07-10-balatro-tracker-design.md`](2026-07-10-balatro-tracker-design.md)
introduced and that every feature since has added to.

## Problem

Every recommendation was a curated 0-10 rating with bonuses added onto it:
`+1.2` per matching synergy tag, `+1.5` for a flush-heavy deck, `-1.5` for a
Rental sticker, `-lost interest × 0.8` for economy. The number had no unit, so:

- **Nothing could be compared honestly.** Is "+1.5 for a suit-heavy deck" more
  or less than "+2 for levelling your hand"? The model had an answer but no
  reason for it.
- **Every signal needed a ceiling.** `Math.min(3, …)`, `Math.min(2, …)`,
  `capAt`, `Math.min(rawScore, 2)` — eleven of them. Each existed to stop one
  additive signal from swamping the rest. They were a symptom of the scale, and
  `tuning.ts` said so when the weights were collected.
- **The score model could not be used.** The app computes a real score estimate
  for 19 jokers, but a chips × mult number cannot be added to a 0-10 rating, so
  it was squeezed in as `Math.min(2, delta / current × 2)` — a genuine
  computation, throttled to a tiebreak.
- **The number shown to the player was meaningless.** The UI printed
  "priority 7.3", which no one could check against their own judgement.

## Decision

One quantity for every card: **the estimated multiplier on your hand score**.
1.0 changes nothing, 1.4 is about 40% more score, 0.8 is about a fifth less.
Signals compose by multiplication, so they cannot race each other upward and
almost every ceiling is gone.

Costs stay in **dollars** until the very end, then convert once through
`TUNING.economy.dollarsPerDoubling`. That exchange rate is the single place
money and score meet — a judgement call stated out loud instead of smeared
across a dozen penalty weights.

`score = impact × 2^(−dollars / dollarsPerDoubling)`

**Buying nothing is exactly 1.0.** It gains no score and gives up no dollars,
so it is the origin of the scale rather than a competitor with a base value of
3 and five bonuses of its own. Everything else is measured against it, which is
why banking needed no weights: the cost of spending is charged to the things
that spend.

### What became computable rather than guessed

- **Planets that level your reference hand** are now exact: level the hand,
  re-run the estimate, take the ratio. This was pure heuristic before.
- **Swapping a joker when slots are full** is the ratio between the newcomer's
  contribution and the one it displaces, instead of a "beats it by more than 1
  point" rule on an unnamed scale.
- **Rental upkeep** is `$3 × rounds actually remaining`, so it correctly costs
  far less at ante 8 than at ante 1. It was a flat `−1.5` before.
- **Vouchers** scale with the rounds left to profit from them, replacing a flat
  late-game penalty with the reason behind it.

## Known weaknesses

Stated plainly, because the new scale makes them visible rather than creating
them:

1. **The two halves measure different things.** The rating prior is absolute
   (how good is this card generally); the score model is marginal (what does it
   do to this board, now). On a bare board every marginal is enormous — the
   basic Joker's +4 Mult really is a 5× gain on an unlevelled High Card, and
   really does stop mattering by ante 4. The two are blended geometrically with
   `TUNING.prior.modelWeight`, set well below half so a modelled joker cannot
   outrank an unmodelled one purely by being one of the 19 with numbers. The
   real fix is to make the prior marginal too, by modelling diminishing returns
   against board strength. Until then the blend is a stopgap and the
   "modelled" label promises more precision than it delivers.
2. **The model is single-period.** It prices what a card does to your next hand,
   not how it holds up over eight antes. This is why an economy plan changes the
   advisor's *reasons* but not its *numbers*: compounding is not priced.
3. **`dollarsPerDoubling` and `ratingTopMultiplier` are unvalidated.** They are
   two honest judgement calls where there used to be fifty, which is progress,
   but neither is trained on anything.

## Effect on advice

Across the 300-scenario engine baseline, the top recommendation is unchanged in
218 scenarios and moves in 82. The option set is identical in 297 — what changed
is ranking, not what the advisor considers. The largest shifts:

| Shift | Count | Why |
| --- | --- | --- |
| voucher → pack | 14 | Vouchers no longer priced as if the whole run were left |
| joker → pack | 9 | Packs use the rating prior directly, jokers pay real dollars |
| consumable → joker | 8 | Synergy and deck fit now compound instead of capping |
| reroll → skip | 5 | A reroll is priced net of the purchase it still requires |

The advisor now also recommends buying more often than it used to. That is a
deliberate change of opinion, not an accident: the old model gave "buy nothing"
a base of 3 out of 10 plus bonuses, which made banking competitive by fiat. With
skip pinned at the origin, a card only has to beat its own price.
