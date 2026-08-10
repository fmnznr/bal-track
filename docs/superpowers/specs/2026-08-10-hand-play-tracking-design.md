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

`totalPlays = Σ handPlays`. Ab `totalPlays ≥ 3` bekommt jeder Archetyp mit
Händen einen Anteil `share = Σ handPlays[seine Hände] / totalPlays`:

- `share ≥ 0,5` → **+3,5**, Reason „You played Flush in 8 of 12 hands (67%)"
- `share ≥ 0,3` → **+1,5**, gleiche Reason-Form

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

**Kalibrier-Garantie:** Bei Standardwerten (4/3, alle Zähler 0) liefert jede
Regel exakt 0 — die 151 Bestandstests bleiben unverändert gültig.

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

## Nicht-Ziele

Streak-abhängige Effekte (Ride the Bus, Obelisks exakte Kette), Discards
*innerhalb* einer Runde, automatische Joker-Effekte auf die Ressource.
