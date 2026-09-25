# Third-party notices

## Scope of the MIT License

The MIT License in [`LICENSE`](LICENSE) applies to Bal-Track's original
application code, original heuristic model, original documentation and
original generated visual assets authored for this project, copyright 2026
fmnznr.

It does not grant any rights in Balatro or in third-party names, terminology,
text, data, trademarks, artwork or other content. Mixed files under `src/data/`
and `src/vision/` are covered by the MIT License only to the extent that they
contain original project material, such as project-authored ratings and tags,
or the project's own code.

## Balatro

Bal-Track is an unofficial, fan-made companion. It is not affiliated with,
endorsed by or sponsored by LocalThunk or Playstack.

The application refers to names, terminology, rules, card effects, prices and
other catalog information from Balatro. Any rights in that game content remain
with their respective rights holders and are excluded from Bal-Track's MIT
license. The repository does not include official game artwork, audio or game
source code.

## Data derived from the game for screenshot recognition

Recognising a card in a screenshot needs something to compare it against. Three
files under `src/vision/` are derived from Balatro's own assets and definitions
rather than authored for this project. They are listed here because the
derivation is what they are, not an incidental detail:

- `card-hashes.json` — a perceptual fingerprint of each of the 281 card
  drawings in the game's sprite atlases: a 512-bit gradient hash plus a 6x6
  grid of average colours per cell, stored as one base64 blob. The atlases
  themselves are not in this repository and are not redistributed. The hash
  records only whether one region of a drawing is brighter than another and
  cannot be inverted; the colour grid is the one part that carries any of the
  original appearance, and the most it could yield is a 6x6-pixel average of
  the card. `scripts/build-card-hashes.mjs` rebuilds the file from atlases
  supplied by whoever runs it.
- `card-ids.json` — which card sits in which atlas cell, transcribed from the
  game's own definitions (the `pos` field of each entry in `game.lua`) rather
  than guessed from the artwork. This is game content: positions and the card
  names they belong to.
- `digits.json` — eleven 12x18 bitmap templates for the digits and the dollar
  sign as the game prints them, built by `scripts/build-digit-templates.mjs`
  from screenshots. Typeface and glyph designs may be subject to their own
  rights.

The screenshots used to build and to measure the recogniser are game frames.
They are the project owner's own captures, they stay out of this repository,
and the scripts take them from wherever the person running them keeps them.

Any rights in the underlying artwork, glyph designs and definitions remain with
their respective rights holders and are excluded from Bal-Track's MIT license.
The MIT License covers the code that produces and reads these files, not the
game content they are derived from.

## Community wiki sources

Catalog information and rule references were transcribed or checked against
community-maintained wiki pages, including:

- [Balatro Wiki on Fandom](https://balatrogame.fandom.com/wiki/Balatro_Wiki)
- [Jokers](https://balatrogame.fandom.com/wiki/Jokers)
- [Vouchers](https://balatrogame.fandom.com/wiki/Vouchers)
- [Tarot Cards](https://balatrogame.fandom.com/wiki/Tarot_Cards)
- [Planet Cards](https://balatrogame.fandom.com/wiki/Planet_Cards)
- [Spectral Cards](https://balatrogame.fandom.com/wiki/Spectral_Cards)
- [Poker Hands](https://balatrogame.fandom.com/wiki/Poker_Hands)
- [Blinds and Antes](https://balatrogame.fandom.com/wiki/Blinds_and_Antes)
- [Stakes on Balatro Wiki](https://balatrowiki.org/w/Stakes)

Fandom states that its community text is generally available under
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) unless a page
says otherwise. Balatro Wiki currently states that its site content is under
[CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/), with
additional terms potentially applying. Links to the source pages above provide
attribution and access to their revision histories.

Any wiki-authored expression reproduced or adapted in this repository remains
subject to the applicable source license and is not relicensed under MIT.

## Software dependencies

Third-party packages retain their own licenses. Their identities, versions and
declared license metadata are recorded in `package.json`, `package-lock.json`
and the packages themselves. The Bal-Track MIT License does not replace those
licenses.
