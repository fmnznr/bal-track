# Growing jokers, stage 1

## Why

A real shop at ante 4 put "Sell Hanging Chad, buy Castle" at the top, at
+139%. Castle had no model, so its 5/10 rating set its value, and a rating
stands for a card's worth over a whole run. Castle starts at 0 Chips and gains
+3 per discarded card of the round's suit: with four discards of about three
cards, a quarter of them that suit, that is about +9 Chips a round. Bought at
ante 4, it is worth about +27 Chips by the next ante. It is the same
overvaluation The Idol had.

## The model

A joker's score block can say it `grows`: by so many Chips or Mult per event,
where the event is a hand played (optionally only a hand containing a given
hand, or one playable as exactly N cards), a discarded card that matches, or a
scoring card that matches. The events a round brings are counted from how the
run plays:

- hands a round takes: `handsNeeded` on the reference hand;
- how often that hand comes together: the hand odds, with misses played as its
  fallback (a Pair);
- discards: the round's allowance, all spent, `cardsPerDiscard` (3) each;
- a card matching: its share of the deck. Castle's suit is drawn from a card of
  the deck (`deckSuit`), so a deck of one suit feeds it every discard.

Green Joker loses a Mult per discard; a player holding it is assumed to spend
a quarter of the round's discards (`discardsSpentWithLoss`).

Those hands and odds are measured on the board with every growing joker left
at nothing, since what they gain depends on them. That errs a little generous:
a board carried by a growing joker needs a few more hands without it.

## Where it is counted

Every card is judged against the boss an ante ahead. A growing joker is valued
where it will stand by then: what it has now plus `roundsAhead` (3) rounds of
growth. A joker in the shop has nothing now. The rest of its long-run worth is
what the rating stands for, and the rating still carries 30% of the blend
(`prior.modelWeight`).

An owned joker needs to know where it stands:

1. bought through the app, from the shop or a pack: nothing, in that round;
2. entered on the Run tab: the value the game shows, in the current round;
3. otherwise one ante of growth is assumed, and the Run tab says it is an
   estimate.

From the first two it grows on with the run's round counter. The score shown
on the Run tab counts growing jokers at what they have now; the ranking counts
them at the next ante.

## Scope

Stage 1 covers the jokers that grow steadily with what a round plays: Castle,
Green Joker, Runner, Square Joker, Spare Trousers and Wee Joker. Not yet:
jokers that reset (Ride the Bus, Obelisk, Campfire, Hit the Road), grow from
things the run does not count per round (Flash Card's rerolls, Red Card's
skipped packs, Constellation's planets, Hologram's added cards, Lucky Cat,
Vampire, Glass Joker), or destroy things (Ceremonial Dagger, Madness).

## What moved

73 of the 300 baseline scenarios moved and five top actions changed. Four are
a fresh Green Joker losing the top spot at antes 3 to 8, where it gains +0 to
+3 Mult a round. The fifth is Grabber on a board with one hand a round: an
owned Green Joker now counts, which lifts the score past the point where a
round needs only one hand. The old value sat on the other side of that same
step, so it is the hands-needed rounding, not the growth, that makes the jump.
