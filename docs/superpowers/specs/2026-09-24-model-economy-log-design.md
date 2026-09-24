# Card-type score model, bosses, money projection and advice log

Four changes that share one aim: fewer numbers taken on trust, and a way to
check the ones that remain.

## 1. The deck as card types (`engine/cards.ts`, `engine/score.ts`)

The estimate priced "an average card" as one number, which cannot say what a
retrigger of a face card is worth or how many Kings sit in hand for Baron. It
now enumerates card types (rank x suit x enhancement) with probabilities from
the deck profile and scores a hand in the game's phases:

1. **Played cards.** Rank chips and enhancements (Bonus, Mult, Glass, Lucky,
   Stone), then each joker's per-card effect left to right. Retriggers
   (Hack, Sock and Buskin, Dusk, Seltzer) scale how often each card type
   fires; Hanging Chad adds triggers to the first card; Photograph fires on
   the first matching card.
2. **Cards held in hand.** Hand size comes from deck, vouchers and jokers;
   held cards are hand size minus the scoring cards. Steel, Baron, Shoot the
   Moon and Raised Fist, all retriggered by Mime.
3. **Jokers, left to right.** Flat, conditional, chance-weighted and counted
   effects, then editions. Blueprint and Brainstorm resolve to the ability
   they copy, chains included.

Chances use their expectation. A listed chance (Bloodstone, Lucky cards) is
doubled by Oops! All 6s; a frequency (Loyalty Card) and "final hand" effects
(Acrobat, Dusk) are not.

Assumptions: rank, suit and enhancement are independent; ranks are even within
the face and non-face groups; you play only the scoring cards. On a plain deck
the model reduces to the old average, so bare estimates did not move.

**Valuing a joker.** A shop joker is tried in every slot and scored where it
adds most, so an xMult joker lands right of the +Mult ones and a +Mult joker
left of the xMult ones. An owned joker is judged by what removing it loses,
not by stacking a second copy. Copy jokers keep their rating as their value:
what they copy over a run is not on today's board. The reason line still says
what they would copy now.

## 2. Boss blinds and prices

The boss of the current ante is optional input on the Run screen and resets
with the ante. `bosses.json` describes the parts the estimate can express:
blind size, debuffs, halved base, level loss, hand size, hands, discards,
cards per hand, no repeated hands. The score line shows the board against it.
Chicot cancels it, and Chicot and Luchador state what disabling it is worth.
The ranking itself still looks an ante ahead, so the boss adds context there
rather than changing numbers.

`engine/prices.ts` applies the game's price rules: edition surcharges,
Clearance Sale and Liquidation with the game's rounding, and Astronomer.

## 3. Money over the horizon (`engine/projection.ts`)

A purchase used to cost its price plus a flat two rounds of lost interest.
Now the bankroll is played forward over `economy.planningHorizonRounds` (six
rounds), once banking and once buying. Income each round is the average blind
reward, spare hands from the score estimate, Green Deck payouts, Gold cards
held, interest (cap and To the Moon) and income jokers. The gap at the end of
the horizon is the cost.

Income jokers are valued the same way and put on the cost side. Their rating
no longer counts, since it mostly stood for that income. A swap weighs both
cards' income.

The simulation banks everything inside the horizon. That is the
conservative reading for a purchase and the honest one for the model, which
does not know what you will buy later.

## 4. Advice log (`run/decisionLog.ts`)

Each shop buy, reroll, "Left the shop", pack pick and "Skipped the pack" logs
the ranking as shown, the option taken, the run context, the run's id and a
fingerprint of `TUNING`. Undo removes the entry with the action. The History
tab shows:

- how often the top pick was taken, in won and in lost runs;
- how much the model thinks deviating gave up;
- which kinds of action the player overrules.

The export holds the decisions, run results and the tuning itself.

The log does not calibrate anything by itself. It supplies the evidence: a
kind of action that is consistently overruled in winning runs is the first
weight to question.
