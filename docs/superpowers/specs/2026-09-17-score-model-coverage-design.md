# Widening the score model: 19 to 40 jokers

Follows
[`2026-09-17-score-multiplier-scale-design.md`](2026-09-17-score-multiplier-scale-design.md),
which put every card on one axis and left the model covering 19 of 150 jokers.

## What was left to model

A pass over the 131 unmodelled jokers found no purely flat effects remaining —
the original 19 had taken them all. Widening coverage therefore meant extending
the *model*, not filling in data. Two groups were tractable, and both use state
the app already tracks:

**Counted exactly off the run.** Bull (+2 Chips per $1), Banner (+30 Chips per
discard), Steel Joker (X0.2 per Steel card), Stone Joker, Blue Joker, Abstract
Joker, Erosion. These need no assumption at all: the run knows the money, the
discards, the deck size and the enhanced-card counts.

**Expected over the cards a hand scores.** The four suit jokers, Arrowhead,
Onyx Agate, Scary Face, Smiley Face, Even Steven, Odd Todd, Scholar,
Walkie-Talkie, Fibonacci, Triboulet. Expected triggers are
`scoringCards × share`, where the share comes from the tracked deck profile for
suits and faces.

`JokerScore` gains `perCard` and `perCount` for these. Coverage goes from 19 to
40 of 150.

## Two mechanics that look alike and are not

Per-**card** xMult compounds: two scoring Kings under Triboulet are X2 and then
X2 again, so a fractional expected count becomes a fractional *power*.

Per-**count** xMult accumulates into one multiplier: Steel Joker's "X0.2 Mult
for each Steel Card" is X(1 + 0.2n), not X0.2 applied n times. Getting this
backwards would turn Steel Joker into a penalty, so the two are separate
functions with the distinction spelled out at each.

## Assumptions, stated

- **Rank shares assume ranks are evenly spread.** The deck profile tracks suits
  and face cards but not ranks, so "each played 10 or 4" is taken as 2 of 13. A
  deck stuffed with one rank scores better than the estimate says.
- **A hypothetical purchase is valued against the board you have now.** Abstract
  Joker counts the jokers you own, not the count after buying it.
- **Held-in-hand effects are still out** (Baron, Shoot the Moon): they depend on
  what you choose to hold, which the app does not model. So is Joker Stencil,
  whose "X1 per empty slot including itself" changes the very count it reads.

Every modelled number is checked against the joker's own effect text by a test,
so a value cannot be invented without the catalog saying it.

## Removing two double counts

Steel Joker had a deck-composition hook and Banner a play signal, both
approximating what the model now computes. Charging a fact twice is worse than
not charging it, so both heuristics were removed and tests added that assert
those jokers now return a neutral signal.

## A problem this surfaced

Modelling Steel Joker exposed a flaw in the model/prior blend. With no Steel
cards it contributes exactly zero, but blending that against its 7/10 rating
reported **+68%** — the advisor saying a card was good while its own model knew
it did nothing. The heuristic hook had been hiding this.

The fix is a principle, not a constant: the blend exists to temper an *inflated*
marginal on a sparse board, so it applies only when the model reports a gain.
When the model reports nothing, that is a certainty rather than a noisy
estimate, and the rating does not get to overrule it.

This also improved swap advice. A hand-conditional joker that cannot fire on
your declared hand — Crafty Joker while you build around a Pair — now reads as
contributing nothing and is correctly identified as the weakest card on the
board, rather than a joker that does fire.

## Effect on advice

The top recommendation is unchanged in **295 of 300** baseline scenarios.

That is the honest headline, and it is not a disappointment: `modelWeight` is
0.3, so modelling a joker changes its number without usually changing the
ranking. The value delivered here is in explanation and in groundwork:

- Recommendations carrying a computed component rose from 48 to 85.
- Reason strings now say what a card actually does on your board: "Modelled at
  +75% on your High Card", "Adds nothing to your High Card as your deck and
  board stand" — claims a player can check and disagree with.
- Deck composition now reaches the score model, not just the heuristics. Greedy
  Joker's estimate follows a deck that has been converted toward diamonds.

Raising `modelWeight` is the payoff, and it is deliberately **not** taken here.
The reason it sits low is the absolute-prior versus marginal-model mismatch
described in the previous design, and wider coverage does not fix that. Making
the prior marginal is the prerequisite, and remains open.
