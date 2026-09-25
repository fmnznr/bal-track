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
2. Hands: Grabber, Nacho Tong — **done**. The other six planned here turned
   out to need something the engine does not have; see below.
3. Shop economy and slots: Clearance Sale, Liquidation, Antimatter — **done**.
   Crystal Ball stayed on its rating; see below.
3b. Reroll Surplus, Reroll Glut, Overstock, Overstock Plus — **done**, from how
   often the player actually rerolls.
4. The rest keep a rating, on a curve with a zero point.

## Reach: the measure shared by every model that touches a blind

Reach is how far a round of the reference hand gets toward a blind: its score
times the hands the round allows, over the target, capped at 1. An ante's
reach is the average over its three blinds, where the boss is the average over
every boss the ante can draw. A voucher that changes a blind is valued by the
ratio of the ante's reach with it and without — the one axis the engine ranks
on, a multiplier on hand score, read as "this much more score would have made
the ante as easy".

The cap is the point: a blind the board clears anyway is not made easier by
another hand or a gentler boss.

## Stage 1 decisions

**Boss rerolls are measured as reach.** For each boss the ante can draw, the
reference hand's score times the hands the round allows, divided by that
boss's target, capped at 1. The cap is the point: a boss the board clears
anyway is not worth ten dollars to avoid. Director's Cut rerolls whenever the
boss is below the pool's average, and a fresh draw is worth the average;
Retcon rerolls until the boss is at least average and is judged by what it
adds to Director's Cut, which it requires. Stage 1 spread the boss round's gain over
the ante as a third of it; stage 2 replaced that with the ante's reach, so a
reroll and an extra hand are measured the same way. Where the small and big
blind are already safe, that makes a reroll worth less — Director's Cut went
from about +4% to +2% on the ante-3 board. Each reroll's $10 is
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

## Stage 2 decisions

**An extra hand is the ante's reach with five hands instead of four.** A board
that cannot yet clear the blinds gets up to a quarter more of the way; one
that clears them anyway gets nothing on that axis, and instead the dollar the
unused hand pays at the end of every round, which the money projection
already counts. Voucher effects on hands, discards, slots and the ante moved
from the store into `applyVoucher` in the engine, so the valuation and the
booking read one table.

**Six vouchers stayed on their rating, because the engine has nothing to
value them with.**

- *Hieroglyph and Petroglyph* go back an ante. Measured as reach, that looked
  like +89% and +151%: ante 2's targets against ante 3's. But ante 8 still has
  to be beaten. What they buy is an extra ante of time to build the board, and
  the engine has no notion of how a board grows over time.
- *Wasteful, Recyclomancy, Paint Brush and Palette* help find a hand: more
  cards to see, more chances to throw bad ones away. The engine assumes the
  reference hand is played every hand and never asks how likely it is to come
  together. Modelling only their side effects — Banner on a discard, Baron on
  a held card — would put them near zero on most boards, the opposite error.

Both need a new concept rather than a new voucher model. The odds of
assembling the reference hand from a hand size and a number of discards
would also serve the jokers that change them (Four Fingers, Shortcut,
Splash), so it is worth building as its own piece.

**Effect.** 17 of the 300 baseline scenarios moved, all through Grabber. Two
top picks changed, both on boards with no modelled joker: Grabber rose to the
top where the board is far from the blinds, and fell just behind a $2 reroll
where it is less so.

## Stage 3 decisions

**A discount saves on what a steady bankroll spends.** Under the projection's
"bank everything", nothing is ever spent and a discount saves nothing, which
no one who has bought Clearance Sale would recognise. Held steady — the same
reading the interest vouchers use — a round spends everything it pays,
interest included, and the discount saves its share of that over the
horizon. Liquidation is measured from the discount already owned: half off
list where a quarter was already off is a third of what is spent now. Rerolls
are left out, since the game does not discount them. It is `partial`, because
"everything a round pays is spent in the shop" is an assumption.

On the ante-3 board a round pays about $7, so Clearance Sale saves about $11
over six rounds — close to its own price. Its rating had it at +141%.

**A joker slot is worth the joker it saves you from selling.** On a full
board, the next joker worth buying displaces the weakest, so Antimatter is
worth what that joker is worth, judged exactly as the sell-and-buy
recommendations judge it. With a slot free it is worth nothing yet.

That last part is a snapshot, and it understates a permanent slot: the board
will fill, and the joker it then keeps will be a better one than today's
weakest. It is the same gap as Hieroglyph's extra ante — the engine has no
notion of how the board will grow — so it is stated in the reasons rather than
guessed.

**Five vouchers stayed on their rating.** Reroll Surplus and Reroll Glut save
on rerolls, and Overstock and Overstock Plus add a card to every shop, which
is worth most to someone who rerolls. How often a player rerolls is not in the
run; it is in the advice log, which is where it should come from once the
engine reads it. Crystal Ball's extra consumable slot depends on consumables
the run cannot foresee.

**Effect.** 21 of the 300 baseline scenarios moved, all through Antimatter.
Its rating put it at +205%, the top pick in four shops; in all four the board
had free slots, and a pack now leads.

## Stage 3b: the player's own reroll rate

Four vouchers depend on how often you reroll, and no single run knows that.
The advice log looked like the source, but it cannot be: a reroll or leaving
the shop is only logged while the shop still has something on offer, so the
common "buy everything, then reroll" goes unrecorded on both sides of the
count.

**Counted from screenshots.** The player reads a new screenshot after every
reroll. Each one carries the round, which names the shop, and the reroll
price, which climbs a dollar with every reroll of it. So a shop's rerolls are
its highest price seen minus the base price ($5, less $2 per reroll voucher
owned), and nothing has to be pressed. A screenshot from earlier in the same
shop reads lower and changes nothing. The visits live on the run, so undo
takes them back; a finished run keeps their totals in the history. An
abandoned run is not in the history, and neither are its shops.

Known undercounts: Chaos the Clown's free reroll and the D6 Tag's $0 rerolls
do not raise the price, so they are not seen.

**No rate until five shops.** Below that the four vouchers fall back to their
rating rather than to a guess at how people shop in general.

**The models.** Reroll Surplus and Glut save $2 a reroll at that rate. An
Overstock adds a card to every page of the shop — the first page and one per
reroll — so with s cards a page, a player who rerolls r times sees as many
cards as (1 + r) / s more rerolls would show, each at the escalated price that
comes after their own. That is `partial`: it assumes you wanted to see those
cards. At 0.8 rerolls a shop on the ante-3 board, Overstock is worth about $5
a shop, and Reroll Surplus about $10 over six rounds, just under its price.
