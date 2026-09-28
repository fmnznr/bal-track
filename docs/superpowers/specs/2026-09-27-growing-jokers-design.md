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

# Stage 2

## What it adds

- **X Mult growth.** Lucky Cat, Glass Joker, Vampire, Hit the Road and Yorick
  gain X Mult, written in as one X(1 + gained). The Run tab takes the value the
  game shows (X2.5) and stores the part above X1.
- **Chance and rate.** Lucky Cat counts the Lucky cards that trigger at all,
  1 - (4/5)(14/15) = 0.253 of them; Glass Joker the Glass cards that shatter,
  one in four. Yorick gains once per 23 cards discarded.
- **Used-up cards.** Vampire strips the enhancement it feeds on and a Glass
  card shatters once, so their growth stops at the matching cards the deck
  profile holds.
- **Resets.** Hit the Road starts over every round: a hand sees on average
  what half the round's discards brought, and there is nothing to record.
  Ride the Bus ends its streak on any scoring face card: with a share p of
  hands free of one, it settles around p / (1 - p) hands, so on a standard
  deck it stays small and on a deck without face cards it grows like the
  others. The scoring cards are taken as they come; a player who picks
  face-free pairs on purpose does better than this.
- **The whole run.** Supernova counts every time the hand has been played this
  run, whenever it was bought: the hands a round takes, times how often the
  hand comes together, times the rounds played. A round counter below the ante
  was never kept, so the ante's rounds stand in for it.
- **Rerolls.** Flash Card grows by the rerolls per shop the screenshots
  counted, once three shops of this run are in; before that the rating
  decides, as for an unmodelled joker.

Supernova's nudge for a declared hand and Glass Joker's deck signal are gone:
both are now in the growth, and would count the same fact twice.

## What moved

154 of the 300 baseline scenarios moved and 16 top actions changed. Only
Supernova and Glass Joker of these jokers are in the baseline's pool. Glass
Joker drops from 1.67 to 0.88 on average: most scenarios hold no Glass cards,
and with none it cannot grow. Supernova drops from 1.74 to 1.02: the rating
put it near the top at every ante, and the count of plays by the next ante is
modest next to the late antes' targets.

## Still out

Constellation, Hologram, Red Card, Fortune Teller, Throwback and Campfire grow
from things the run does not count per round (planets used, cards added, packs
skipped, tarots used, blinds skipped, cards sold). Obelisk, Madness,
Ceremonial Dagger and Canio depend on play history or destroy jokers and cards.
