# Design: Punkte-Schätzung (Stufe 1)

**Datum:** 2026-08-10 · **Status:** Vom Nutzer freigegeben (gestufter Ansatz)

## Problem (Nutzer-Feedback)

„Behält die App auch den Zugewinn von Chips, +Mult, und xMult durch Joker
und Karten im Auge? Das wäre auch wichtig bei der Joker-Kaufberatung."

Heute: nein. Joker tragen eine kuratierte Note je Spielphase und Tags; der
Effekttext („+12 Mult") ist reine Anzeige und wird nie gerechnet. Die
entscheidende Shop-Frage — *reicht das für den Boss Blind?* — kann die App
damit nicht beantworten.

## Ziele (Stufe 1)

- Geschätzte Punktzahl der typischen Hand, verglichen mit den Blind-Zielen
  der aktuellen Ante.
- Je Shop-Joker der geschätzte Zugewinn auf diese Hand.
- Vollständige Ehrlichkeit darüber, welche Joker **nicht** eingerechnet sind.

## Datenmodell

### `src/data/handValues.json`

Je `HandType`: `baseChips`, `baseMult`, `chipsPerLevel`, `multPerLevel`,
`scoringCards` (wie viele Karten die Hand wertet). Werte gegen das Wiki
geprüft, nicht aus dem Gedächtnis.

### `src/data/blinds.json`

`anteBase: number[]` (Index 1–8) und `multipliers: { small, big, boss }`
(1 / 1,5 / 2).

### Joker-Punktwirkung

`jokers.json` erhält ein **optionales** Feld:

```
score?: { chips?: number; mult?: number; xmult?: number }
```

Nur für eindeutige, unbedingte Effekte („+4 Mult", „X3 Mult", „+30 Chips").
Bedingte („+3 Mult je Karo"), wachsende (Green Joker) und
wahrscheinlichkeitsbasierte Joker bekommen **kein** Feld. Editionen zählen
mit: Foil +50 Chips, Holographic +10 Mult, Polychrome ×1,5.

## Engine (`src/engine/score.ts`, pur)

```
estimateHandScore(run, hand) → {
  chips, mult, score,
  modeled: string[],    // Namen der eingerechneten Joker
  unmodeled: string[],  // Namen der nicht eingerechneten
}
```

1. Basis: `baseChips + chipsPerLevel × (level − 1)`, analog Mult.
2. Kartenchips: `scoringCards × geschätzter Durchschnittswert` aus dem
   Deck-Profil (Bildkarten-Anteil gewichtet; Standarddeck ≈ 7,3).
3. Joker **in Besitzreihenfolge**: erst `chips`, dann `mult`, dann `xmult`
   multiplikativ — dieselbe Reihenfolge wie im Spiel. Editionen inklusive.
4. `score = chips × mult`.

`blindTargets(ante) → { small, big, boss }` aus der Blind-Tabelle.

`estimateJokerDelta(run, hand, jokerId, edition)` = Schätzung mit dem Joker
minus Schätzung ohne ihn.

**Referenzhand:** die meistgespielte Hand (aus der Hand-Statistik), sonst
die höchstgelevelte, sonst `High Card`.

## Anbindung an die Beratung

Im Shop erhält jeder Joker mit modellierter Wirkung die Reason
„+1.800 estimated on your Flush" und einen **auf ±2 begrenzten**
Score-Beitrag, skaliert am relativen Zugewinn (verdoppelt die Hand → +2).
Die bestehende, mehrfach geprüfte Heuristik bleibt führend; die Schätzung
bricht Gleichstände und weist auf Schwellen-Käufe hin, kann eine Karte aber
nicht allein tragen oder versenken.

## UI

`ScorePanel` auf dem Run-Screen unter dem Strategie-Panel:

```
Typical Flush ~2,400 · Ante 3 targets 2,000 / 3,000 / 4,000
Not counted: Green Joker, Ride the Bus
```

Die Zahl ist immer als Schätzung gekennzeichnet („~"), und die
Nicht-gezählt-Liste steht direkt daneben — nie eine Zahl ohne ihre Grenzen.

## Tests

Hand-Basiswerte gegen Wiki-Stichproben; Level-Skalierung; Kartenchip-
Schätzung; Joker-Reihenfolge (+Mult vor ×Mult ergibt mehr als umgekehrt);
Editionen; modeled/unmodeled-Listen; Blind-Ziele je Ante; Delta-Berechnung;
Deckelung des Score-Beitrags bei ±2; Neutralität ohne modellierte Joker
(bestehende Tests bleiben grün).

## Nicht-Ziele (Stufe 2 und später)

Bedingte Joker per Erwartungsrechnung, wachsende Joker mit Eingabefeld,
Wahrscheinlichkeiten, Stake-Skalierung der Blinds, Boss-Blind-Sondereffekte,
Retrigger, Hand-Größe und Kartenanzahl je Hand exakt.
