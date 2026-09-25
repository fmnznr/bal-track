# Reading a shop from a screenshot

Realises the screenshot input listed as a later stage in [`2026-07-10-balatro-tracker-design.md`](2026-07-10-balatro-tracker-design.md)
and deliberately left out of v1.

## Problem

Typing a shop takes about four autocomplete entries. That is already the result
of [the input reduction](2026-09-17-primary-hand-design.md), and it is the last
manual step left in a session. A screenshot contains the same information
exactly, and the player takes one anyway when they want to think about a shop.

## What was measured before designing

A spike ran against the real assets and ten real screenshots (iPhone, 2556x1179,
English game). Every number below is measured, not assumed.

**Sprites are separable.** All 158 cells of `Jokers.png` were hashed with a
512-bit gradient hash plus a coarse 6x6 colour signature. The median distance to
the nearest other sprite is 170; the closest distinct pair is 41 apart. The four
cells below that are two pixel-identical duplicates in the atlas itself
(`r4c0`=`r6c3`, `r0c0`=`r11c1`), not a recognition problem.

**Foreign cards reject themselves.** Playing cards, the deck back, packs and
vouchers matched against the joker table at 218-329 with margins under 20, while
true jokers landed at 78-138 with margins of 58-113. Two independent criteria —
absolute score and margin to the runner-up — separate them with a clear gap.

**All four atlases work.** A full shop screenshot was read end to end: two owned
jokers, the owned Star tarot, the shop joker, a Judgement tarot, a voucher, and
an Arcana and a Celestial pack. Eight of eight correct.

**Crop precision dominates everything else.** The same two jokers scored 86 and
90 from tight crops and 192 and 220 from generous crops that included felt,
shadow and the price pill. That is a larger effect than card tilt and than a
wrong-language atlas combined, and it decides the design: the detector, not the
hash, is the hard part.

**Language costs little for jokers, and is untested elsewhere.** Comparing the
English atlas against the Turkish one cell by cell gives a median difference of
10 points. Four cards differ materially — Driver License (153), To Do List
(137), Reserved Parking (98), Credit Card (61) — two of them in colour, not only
in text. No card overtakes another, so even a wrong-language table would work
for jokers. Tarots and vouchers carry a name band across a large part of the
card and are expected to be far worse; that was not measured.

## Decision

Recognition is a pure function in the engine layer, in the shape the rest of the
codebase already uses:

```
recogniseCards(image: ImageData): DetectedCard[]
```

with `DetectedCard = { box, kind: 'joker'|'tarot'|'voucher'|'pack', id, score, margin }`.

It never writes to the store. The UI shows what was recognised, the player
confirms or corrects it, and only the confirmed result is dispatched. A silently
wrong joker poisons every recommendation that follows, so nothing enters the run
without a human nod.

**The reference table ships as numbers, not pictures.** The atlases stay out of
the repository; `scripts/build-card-hashes.mjs` turns them into fingerprints.
281 cards come to 74 KB as one base64 blob — three times smaller than the same
table written as JSON numbers, and about a fifth of the app's current bundle.
No game art ships: the gradient hash cannot be inverted, and the colour
signature is a 6x6 average per card, which is the whole of what any of this
retains of the original drawing. The
script loads the app's own fingerprint code rather than restating it: two
implementations of one hash drift apart, and a drifted table matches nothing.

**The detector is background-agnostic.** It finds cards by their own border and
drop shadow, not by the colour around them. The felt is green on the shop
screen, purple and animated while a pack is open, and gold behind a sell
overlay; a background-colour filter already failed on the pack screen in the
spike, which is precisely the screen with the most to gain.

**Which card sits in which cell is read, not guessed.** The game's own
definitions carry each card's atlas position, and `src/vision/card-ids.json`
is that table: 265 cells, every one of the 150 jokers, 52 consumables, 32
vouchers and 15 pack sorts covered. Sixteen cells hold sprites that are not
cards — the legendaries' soul faces, locked placeholders, a duplicated
drawing — and they stay in the reference table without a name, so that
matching one of them reports nothing rather than handing back the card whose
fingerprint happened to be next closest.

**Position classifies the slot, the match classifies the card.** Cards are
grouped into rows by vertical position: the top row is what the player owns, the
rows below are what is on offer. The card's identity comes from the hash match
alone, which is also what rejects playing cards and the deck back.

**The price tag is read, not assumed.** A shop under Clearance Sale or
Liquidation charges less than a card's catalog cost, and the engine's whole
judgement is whether a card is worth the dollars it takes. The tag above a
card is gold pixel-font text on a dark plate; each glyph is normalised onto an
8x12 grid and matched against eleven templates, which is why one set of
templates serves every screen size. There is no OCR engine involved and none
is warranted. An unreadable tag yields nothing rather than a guess, and the
catalog price stands — which is also the right answer for the jokers already
in play, since they carry no tag at all.

## What the built recogniser does

Measured over the same ten screenshots, running the shipped TypeScript:

| Screen | Found |
| --- | --- |
| Shop | 8 of 8 — three jokers, two tarots, the voucher, both packs |
| Opened Arcana pack | 5 — both owned jokers and all three tarots on offer |
| Blind, blind choice, play | every uncovered joker and consumable |
| Run Info dialog | nothing, correctly |
| Sell overlay | the two consumables; the covered jokers are not guessed at |
| Shop with a Holographic joker | 7 of 7, the tinted card included |
| Opened Buffoon pack | 4 of 4, on the pack's animated orange field |

No false positive in any of the twelve. 371-1301 ms per screenshot in Node,
dominated by the refinement search.

Thresholds come from those runs rather than from taste: across twenty-four
screenshots, everything that really was a card scored 52-210, and the best
non-card — a playing card in a fanned hand — scored 225. The cut sits at 215.

The distance to the runner-up is only a second opinion, and it has to stay
low. The jokers that share a drawing and differ mainly in colour keep 17-30
points of daylight by their nature, because their runner-up is always a
sibling; asking for 25 threw four real cards away across ten screenshots taken
on the phone and caught nothing false in exchange.

## How it reaches the run

The shop and pack screens each carry a "Read a screenshot" control. What comes
back is a list to confirm, not a change to the run: every recognised card is a
ticked row the player can untick, and only what is still ticked is added. A
wrong joker would skew every recommendation after it, and the cost of catching
one here is a single tap.

Two things the reading knows, the list says out loud. Cards in the top third of
a screenshot are the jokers already in play rather than the shop's offer, so
their row says so and sends them into the run instead — a shop cannot be judged
without the board it is judged against — and the choice is a select, because
the guess comes from where a card sat and not from what it is. And where one
sprite serves two cards, the row becomes a choice rather than a guess.

Reading runs in a worker: it takes one to three seconds on this hardware, and
an interface frozen that long reads as a crash. Covering wide blobs multiplies
the candidates, so the search compares crops sampled coarsely — a handful of
pixels per cell of the hash grid rather than all of them — while the decision
to accept a card is taken once, on a carefully sampled crop. Searching cheaply
and deciding carefully is what keeps both the speed and the margin at the
threshold. There is no same-thread fallback,
which would mean a second copy of the reference table in the bundle. The
recogniser and its table are a separate chunk, loaded when a screenshot is
first read: the initial bundle grows by 3.5 KB, the precache by 86 KB.

Prices come off the tags: measured against two real shops, all eight were
read correctly — $7 Madness, $3 Judgement, two $4 packs, the $10 Overstock
voucher, $6 Reserved Parking, $9 Ride the Bus, $10 Planet Merchant — and the
owned jokers, which have no tag, correctly returned nothing.

The money you hold and the reroll cost are read too, so a screenshot now fills
a shop without a number left to type. They need no new method, only somewhere
to look: money is the largest gold amount in the status column that is not
sitting above a card, and the reroll cost is the number on the one strongly
green button. Glyphs are grouped into words from their own connected strokes
rather than from rows of the image, because the column stacks a sign, a plate
and two counters that share rows with each other; the grouping also asks for a
similar glyph height, which is what keeps the "Options" button out of the
money.

Measured on twenty-one screenshots: the money read correctly in every one that
shows the column — $2, $5, $8, $14, $29, $52 among them — and returned nothing
for the one where a dialog covers it. The reroll cost read $5 on each of the
four shop screenshots and nothing on the seventeen screens that have no shop.

### The four counters beside the money

Hands, discards, ante and round are read the same way, and the money plate is
what places them. Balatro's status column is a fixed stack — hands and discards
on one row, the plate under them, ante and round under that — so each counter
is the number of its own colour on the right side of the plate, above it or
below it. Colour alone would not do: the Run Info button is the same red as the
discards counter and closes into a blob the digit reader is happy to call a
"0". Its size gives it away, so a counter must also be printed at roughly the
plate's size.

This needed a finer glyph grid. The counters are about twice the size of a
price tag, and on the 8x12 grid the loops of an "8" quantise to two columns, so
one pixel of jitter turned an ante 8 into a 0 or a 6 — two of the three ante-8
screenshots read wrong. The templates are now 12x18 and built from samples of
both sizes; every price the old templates read, the new ones read the same.

Measured on eighteen screenshots showing the column, ninety values in all:
every one correct.

One caveat is deliberate: in a shop the hands and discards on display are the
next round's full allowance, which is what the run tracks. Read mid-round they
would be what is left of this one, and the import would understate both.

## Trade-off accepted

Recognition is offered for the shop and the pack-opening screen only. Screens
with overlays covering the cards — "Upgrade!", "Sell $1" — are not handled; two
of ten spike screenshots were of that kind, and there the detector must say "no
cards found" rather than guess.

The English atlases are the shipped table. A player on another language gets
worse matches on the handful of text-bearing cards, and likely bad matches on
tarots and vouchers. Both are acceptable for a private app whose owner plays in
English; a second table can be added later for ~25 KB.

## Open points

- The detector's crop precision is the one number that decides the feature's
  quality. Target: tight crops that reproduce the 78-138 score band on jokers,
  not the 192-220 band.
- Editions behave as hoped, on one sample: a Holographic Ride the Bus matched
  its plain reference at 176 where the untinted card scores about 95, and kept
  a margin of 89. The tint costs roughly 80 points and the gradient hash
  carries the match, so a tint could identify the edition rather than defeat
  the match. One card is not a calibration, and Polychrome is untested.
- The jokers that share a drawing and differ mainly in colour are the tightest
  real cases: four of them in one shop matched correctly but with margins of
  25-48, against 89-195 elsewhere. If a misread ever happens, it starts here.
- Stickers (Eternal, Perishable, Rental) overlay the card. Untested.
- **A Negative joker is not recognised.** The game redraws it dark — white card
  to near-black, its line art to pale blue — and a hash built from "is this
  side brighter than that one" sees a different picture: a Negative Hanging
  Chad ranked last of 281 against its own sprite. Comparing the crop inverted
  helps (520 to 371) but nowhere near a match, because the treatment recolours
  rather than inverts. Since these appear in about every third run, and the
  player is willing to type one, the gap is left open rather than papered over:
  the alternative is a second, polarity-blind fingerprint, worth building only
  if typing them becomes the annoyance.
- One cell names two cards: the game draws Joker and Wee Joker from the same
  sprite, so a match there is genuinely ambiguous and the player has to pick.
  That is the only such case in the catalog.
