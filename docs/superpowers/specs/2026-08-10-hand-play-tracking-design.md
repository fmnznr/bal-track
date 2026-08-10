# Design: Hand-Statistik und Runden-Ressource

**Datum:** 2026-08-10 · **Status:** Vom Nutzer freigegeben

## Problem (Nutzer-Feedback)

1. „Number of hands played angeben wäre hilfreich für manche Joker."
2. „Wenn man ein Flush Deck spielt, wird das mehr oder weniger ignoriert
   und man bekommt nicht die richtigen Vorschläge."

Diagnose zu (2): Die App erfährt nie, welche Hände tatsächlich gespielt
werden. Der Build wird nur aus Jokern, Deck und Hand-Leveln geschlossen.
Gerechnet: neutrales Deck, Flush auf Level 3, kein Flush-Joker →
`min(3, 2 × 0,75)` = **1,5 Punkte**, `LEAN_THRESHOLD` ist 3 → „Open".

## Datenmodell

`RunState` erhält:

```
handPlays: Record<HandType, number>   // alle 0 zu Beginn
handsPerRound: number                 // Standard 4
discardsPerRound: number              // Standard 3
```

Deck-Vorbelegung: Blue +1 Hand, Black −1 Hand, Red +1 Discard; alle anderen
4/3. Migration: `load()` rüstet fehlende Felder aus Deck-Defaults nach
(auch in `past`-Snapshots), Zähler auf 0.

## Halbautomatik

`REDEEM_VOUCHER` bucht mit: `grabber` +1 Hand, `nacho-tong` +1 Hand,
`wasteful` +1 Discard, `recyclomancy` +1 Discard. Joker-Effekte (Burglar,
Drunkard, Merry Andy …) bleiben manuell — sie sind im Spiel sichtbar und zu
zahlreich für eine ehrliche Tabelle. Alle Werte manuell editierbar,
Untergrenze 0.

## Engine

### Play-Share im Strategieberater (`strategy.ts`)

`totalPlays = Σ handPlays`. Ab `MIN_PLAYS = 8` bekommt jeder Archetyp mit
Händen einen Anteil `share = Σ handPlays[seine Hände] / totalPlays`:

- `share ≥ 0,5` → **+3,5**, Reason „You played Flush in 8 of 12 hands (67%)"
- `share ≥ 0,3` → **+1,5**, gleiche Reason-Form

**Rampe (nach Review):** Der Bonus wird mit `playConfidence` gewichtet —
0 unter 8 Händen, linear bis zur vollen Wirkung ab 12 Händen (rund
1,5 Antes). Eine einzelne Blind kann den Plan damit nicht umschreiben.

Damit erreicht ein reiner Flush-Spieler ohne Joker 3,5 (→ `lean`), mit einem
Flush-Joker und Level-3-Flush 7,0 (→ `commit`). Archetypen ohne Hände
(face-cards, scaling, economy) sind unberührt.

### Planeten (`recommend.ts`)

`planetBonus` erhält: Ist die Hand der Planetenkarte die meistgespielte
(Zähler > 0), +1,5 mit Reason „Flush is your most played hand (8 plays)".

### Joker-Signale (`engine/playSignals.ts`, pur)

`playSignalForJoker(def, run) → { delta, notes }`, sechs eindeutige Fälle:

| Joker | Regel |
|---|---|
| supernova | `+min(3, maxPlays × 0,15)` ab 3 Plays, Reason mit Zahl |
| obelisk | dominanter Anteil > 0,6 → −2 („wants variety") |
| green-joker | `+min(2, totalPlays × 0,08)` ab 3 Plays |
| ice-cream | `−min(2, totalPlays × 0,08)` ab 3 Plays |
| banner | `(discardsPerRound − 3) × 0,5` |
| delayed-gratification | `(discardsPerRound − 3) × 0,5` |

**Kontext (nach Review):** `green-joker` und `ice-cream` skalieren erst ab
dem Moment, in dem man sie besitzt — ihre Signale gelten deshalb nur für
eigene Joker (`context: 'owned'`), nicht für Shop-Karten. Supernova wirkt
laut Wiki rückwirkend und zählt daher auch im Shop.

**Kalibrier-Garantie:** Bei Standardwerten (3 Discards, alle Zähler 0)
liefert jede Regel exakt 0. **Ausnahme mit Absicht:** Das Red Deck startet
mit 4 Discards, deshalb bewerten `banner` und `delayed-gratification` dort
schon zu Beginn +0,5 — das entspricht der Spielrealität und ist durch einen
eigenen Test festgehalten.

Eingehängt wie die Deck-Signale: Shop-Joker, Pack-Picks und
`ownedJokerValue` (Verkaufskandidaten).

## UI

`<details>` „Hand levels" wird zu **„Hands"**: zuerst zwei NumberFields
(Hands per round, Discards per round), darunter je Pokerhand zwei Felder
(`{Hand} level`, `{Hand} played`). Bleibt eingeklappt.

## Tests

Store (Defaults je Deck, Migration inkl. Snapshots, Zähler-Edits mit
Untergrenze, Voucher-Automatik), Strategie (Flush-Blindheit behoben: 8/12
Flush ohne Joker → mindestens `lean`; Schwellen 0,3/0,5; unter 3 Plays kein
Effekt), Planeten-Bonus für meistgespielte Hand, jede der sechs
Joker-Regeln inkl. Null-Wirkung bei Standardwerten, UI (Felder rendern und
dispatchen).

## Bewusst offen (Backlog aus dem Review)

- Gleichstand zweier Archetypen (z. B. Flush 5 / Pair 5, oder ein Straight-
  Flush-Spieler, der beide Archetypen gleich bedient) wird über die Reihen-
  folge in `archetypes.json` entschieden statt über ein Kriterium.
- `banner`/`delayed-gratification` sind nach oben ungedeckelt — absurd hohe
  manuelle Discard-Werte schlagen ungebremst durch.
- Der Stake wird ignoriert (ab Blue Stake −1 Discard).
- Denselben Voucher zweimal einlösen stapelt (bestehendes Muster).
- Obelisk ist einseitig (nur 0 oder −2) und hat eine Kante bei genau 60 %.
- `mostPlayedHand` bricht Gleichstände zur früheren Hand hin.

## Nicht-Ziele

Streak-abhängige Effekte (Ride the Bus, Obelisks exakte Kette), Discards
*innerhalb* einer Runde, automatische Joker-Effekte auf die Ressource.
