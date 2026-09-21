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
A fingerprint cannot be turned back into a picture, so no game art ships. The
script loads the app's own fingerprint code rather than restating it: two
implementations of one hash drift apart, and a drifted table matches nothing.

**The detector is background-agnostic.** It finds cards by their own border and
drop shadow, not by the colour around them. The felt is green on the shop
screen, purple and animated while a pack is open, and gold behind a sell
overlay; a background-colour filter already failed on the pack screen in the
spike, which is precisely the screen with the most to gain.

**Position classifies the slot, the match classifies the card.** Cards are
grouped into rows by vertical position: the top row is what the player owns, the
rows below are what is on offer. The card's identity comes from the hash match
alone, which is also what rejects playing cards and the deck back.

**The price pill is part of recognition, not an extra.** Packs come in four
colour variants per sort, and Jumbo and Mega resemble the normal size closely;
margins there were 13. The price ($4 / $6 / $8) resolves it. Digits are read by
the same template match against the game's own font, not by a general OCR
engine.

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

Thresholds come from that run rather than from taste: across 170 refined
candidates, everything that really was a card scored 52-207, and the best
non-card — a playing card in a fanned hand — scored 225. The cut sits at 215.

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
- The atlas cell that each reference belongs to is known; which joker sits in
  that cell is not. Every entry ships with `id: null` until the mapping is
  derived from the game's own definitions rather than guessed by eye — a
  confident wrong name is the one failure mode this design refuses.
