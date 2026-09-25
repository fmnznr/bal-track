# Hand odds

## Problem

The score model assumes the reference hand is played every hand. That is the
right thing to score, but it cannot see anything whose value is making the
hand easier to find: another discard, a bigger hand, Four Fingers, Shortcut,
Smeared Joker. Wasteful, Recyclomancy, Paint Brush and Palette were left on
their rating for exactly that reason, and modelling only their side effects
(Banner on a discard, Baron on a held card) would have put them near zero —
the opposite error.

## The odds

`src/engine/handOdds.ts` answers one question: how likely is this hand to come
together from a fresh `handSize` cards with up to `discards` discards?

It plays the draw out. The deck is built as concrete cards from the card
types — the same distribution the score model uses, rounded to whole cards by
largest remainder — shuffled 2000 times with a fixed seed, and each time a
plain strategy runs: keep what builds toward the hand, throw up to five of the
rest, draw back up, stop as soon as the hand is there. What counts as "the
rest" depends on the hand: cards off the best suit for a Flush; cards outside
the best five-rank window, or a second card of a rank in it, for a Straight;
cards that do not repeat for the pair family; for Three, Four and Five of a
Kind, everything but the most common rank. A card that already builds toward
the hand is never thrown just to fill a discard. Four Fingers, Shortcut and
Smeared Joker change what counts as made and what the strategy keeps.

Where no strategy is involved it matches the exact numbers: a Pair in 8 dealt
cards is 88% (exactly 88.8%), a Flush 6% (about 6.9%). With 8 cards and three
discards a Flush comes together 92% of the time, a Straight 79%, a Full House
65%.

The strategy is deliberately plain, so the odds are a floor. What the engine
uses is how they change when a voucher or joker changes the inputs, and that
is much less sensitive to how clever the strategy is. Results are cached; a
fraction of a discard interpolates between the whole numbers either side.

## The effective score

`effectiveScore(run)` is what a hand of the reference type scores on average:
the made score when it comes together, and a Pair's score when it does not,
weighted by the odds. The round's discards are spread over the hands the board
needs to clear a blind, so a board that wins in one hand pours every discard
into it and one that needs four gets three quarters of one each.

Two simplifications, both stated so they can be revisited:

- A miss is played as a Pair (High Card when the reference is a Pair). Often
  the real fallback is better, so misses are scored a little low.
- Playing a hand also cycles five cards, which helps the next one; the model
  treats each hand as a fresh deal with its share of the discards. That makes
  an extra hand look like it spreads the discards thinner than it does.

## Where it is used

Only in the voucher models, for now: reach — score times hands over the
target — uses the effective score, so every voucher valued by reach sees the
same, more honest board. Wasteful, Recyclomancy, Paint Brush and Palette are
modelled with it; their reasons name the odds before and after ("Your Flush
comes together about 55% of the time, 65% with it") and are marked `partial`,
because the odds come from a plain strategy.

The score estimate itself, and so every joker's value, still assumes the
reference hand. Folding the odds in there is the next step and a much larger
one: it would move every recommendation. Four Fingers, Shortcut and Smeared
Joker can then be valued by the effective score they add.

## Effect

With a Flush declared on the ante-3 board, Wasteful is worth about +4% (55% →
65%) and Paint Brush about +4%; with a Straight, Paint Brush about +11%. With
no hand declared the reference is High Card, which always comes together, so
these vouchers are worth nothing — declaring a hand is what lets them count.

The voucher curve was refitted with the four new models: 0.213 against 0.209
before, and the four landed within x0.95 to x1.01 of the old curve — an
independent check, since they were not part of the first fit.

10 of the 300 baseline scenarios moved, all through Grabber; none of the
baseline shops offers a discard or hand-size voucher. Two top picks changed:
on an empty board building Straights, Grabber fell behind a $3 reroll, since a
fifth hand now also spreads the discards thinner; on a board building a Flush
House, which rarely comes together, it rose to the top, since that board is
weaker than its made score says and a hand more matters more.
