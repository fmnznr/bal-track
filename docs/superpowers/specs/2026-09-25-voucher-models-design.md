# Voucher models

## Problem

Every voucher was valued through the joker rating curve: its rating became a
share of the score target, as if it added that much to every hand. So a
voucher's value was its rating and nothing else. On a real ante-3 shop,
Director's Cut, Grabber, Money Tree and Hieroglyph all came out at +85% score,
and Blank — "Does nothing?" — at +8%. The curve has no zero point, which is
defensible for jokers (almost all of them add something to a hand) and wrong
for most vouchers, which change no hand at all.

## Approach

`src/engine/vouchers.ts` holds a model per voucher, built from machinery the
engine already has. A voucher with a model is ranked by it and labelled
`modeled` or `partial`; one without still falls back to its rating. The work
is staged so each step's effect on the rankings can be read on its own:

1. Director's Cut, Retcon, Seed Money, Money Tree, Blank — **done**.
2. Hands, discards and hand size: Grabber, Nacho Tong, Wasteful, Recyclomancy,
   Paint Brush, Palette, Hieroglyph, Petroglyph.
3. Shop economy and slots: Clearance Sale, Liquidation, Reroll Surplus,
   Reroll Glut, Overstock, Overstock Plus, Crystal Ball, Antimatter.
4. The rest keep a rating, on a curve with a zero point.

## Stage 1 decisions

**Boss rerolls are measured as reach.** For each boss the ante can draw, the
reference hand's score times the hands the round allows, divided by that
boss's target, capped at 1. The cap is the point: a boss the board clears
anyway is not worth ten dollars to avoid. Director's Cut rerolls whenever the
boss is below the pool's average, and a fresh draw is worth the average;
Retcon rerolls until the boss is at least average and is judged by what it
adds to Director's Cut, which it requires. The gain applies to the boss round,
one round in three, so it is spread over the ante. Each reroll's $10 is
charged over the horizon.

This turns a survival question into the engine's one axis, a multiplier on
hand score, and the translation is an assumption: that making a boss round
X% easier is worth what X% more score on that round would be. It is labelled
`partial` for that reason. On the ante-3 board it comes to about +4% for
Director's Cut, below buying nothing at $26.

**Interest vouchers are valued at the money you hold, not played forward.**
The projection assumes you bank everything. For the cost of a purchase that
is the careful reading. For an interest voucher it is the generous one, since
every dollar it earns comes from money you did not spend. Played forward,
Money Tree outranked every pack in a dozen baseline shops on money nobody had
yet. Seed Money now pays only once the bankroll left after buying it is above
the old cap, which is when players buy it anyway.

**A second-tier voucher assumes its first tier.** The game only offers Money
Tree once Seed Money is owned, and Retcon once Director's Cut is. The run may
not record the first tier, and the baseline generator offers vouchers without
checking. Judged without it, Money Tree was credited with both steps.

**Blank is worth nothing.** It unlocks Antimatter in a later shop, and that is
said in its reasons but not counted: whether Antimatter ever turns up is not
something the run knows.

## Effect

29 of the 300 baseline scenarios moved, all of them through Seed Money or
Money Tree (Director's Cut, Retcon and Blank do not appear in the baseline).
No top pick changed. The voucher's own score fell in 24 and rose in 4 — the
four where the bankroll already sits above the cap, which is where an
interest voucher genuinely pays.
