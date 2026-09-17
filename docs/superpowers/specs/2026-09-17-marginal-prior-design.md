# Putting the rating prior on the same footing as the score model

Closes the weakness named in
[`2026-09-17-score-multiplier-scale-design.md`](2026-09-17-score-multiplier-scale-design.md)
and restated in
[`2026-09-17-score-model-coverage-design.md`](2026-09-17-score-model-coverage-design.md).

## Problem

The two halves of the model measured different things.

The **score model** produced a marginal: what this card does to *this* board.
The **rating prior** produced an absolute: how good the card is, generally.
Blending them meant averaging a ratio against a constant, which is not a
meaningful operation, and it broke in both directions:

- On a bare board the marginal exploded. A basic Joker's +4 Mult on an
  unlevelled High Card really is a 5x gain on a score of 12 — and is nowhere
  near the 600 the blind demands. The advisor read "+400%" for a card that
  cannot win a hand.
- To contain that, `modelWeight` sat at 0.3, so the rating quietly carried most
  of every decision while the UI labelled the result "part computed".

## Decision

Both halves now produce the **same quantity**: an absolute score contribution,
converted to a multiplier once, against a shared baseline.

```
contribution = modelled^w x rated^(1-w)
multiplier   = min(baseline + contribution, ceiling) / baseline
```

`priorContribution(run, rating)` is what the rating is worth *in score*: a share
of the near-term blind target, falling away along a curve. The score model
already produced score. They are now addable, comparable and blendable, and
`modelWeight` rose from 0.3 to 0.7 — the model genuinely carries the decision.

The geometric blend also removed a special case. A modelled contribution of zero
now carries through on its own, so a joker the model knows cannot fire is not
rescued by a good rating. The explicit "don't let the prior rescue a dead card"
branch added in the previous round is gone; the arithmetic does it.

## Two horizons, not one

The baseline needs a **floor** and the gain needs a **ceiling**, and they are
not the same number. Building both on one horizon was a bug found by reading
the baseline diff, not by a failing test:

- **Floor** — `scoreTarget`, the boss blind one ante ahead, times
  `minBaselineShare`. Without it, dividing by a bare board's 12 makes every card
  a miracle. Boards far below the bar are all equally losing, so what matters
  there is how much a card *adds*.
- **Ceiling** — `scoreCeiling`, the boss blind of ante 8. Past this, more score
  genuinely buys nothing.

Saturating at the near-term target instead told a player at ante 2 to stop
buying the moment they could clear ante 3 — which is how runs are lost, since
the bar rises another 2.5x every ante afterwards. In the baseline that showed up
as 16 scenarios flipping to "buy nothing" on boards scoring around 3,000. With
the horizons separated, those buy again.

## What the player sees

Reason strings now quote score, not a ratio to a possibly-tiny baseline:

> Modelled at about 2,240 score on your Flush, weighed against its 4/10 rating
> over a full run

That is a claim about the game, checkable against the player's own reading of
the board.

## Effect on advice

Against the previous baseline: top recommendation unchanged in 247 of 300
scenarios, moved in 53. The headline numbers behave better at both ends — the
highest top-score fell from 17.2 to 6.1, because nothing is measured against a
near-zero baseline any more, and "buy nothing" wins 41 scenarios rather than 30,
because weak cards no longer look like miracles early.

The largest shifts are jokers giving way to packs (14) and consumables (10).
Both follow from the same correction: an unmodelled joker used to carry a flat
absolute multiplier regardless of board, and now has to contribute score like
everything else.

## What is still open

- **Still single-period.** The model prices what a card does to your next hand.
  An economy build's compounding remains unpriced, so a plan changes the
  advisor's reasons but not its numbers.
- **`topShareOfTarget`, `ratingCurve`, `minBaselineShare` and
  `dollarsPerDoubling` are unvalidated.** Four honest judgement calls, each in a
  named place with its reasoning written down — but none trained on real runs.
  Calibrating them against played games is the next real step, and it needs data
  the project does not collect.
- **Ratings still do most of the work for 110 of 150 jokers.** Coverage, not the
  blend, is the limit there now.
