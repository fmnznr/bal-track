# Design: Ersetzungs-Hinweis bei Pack-Picks

**Datum:** 2026-07-19 · **Status:** Vom Nutzer freigegeben

## Problem

Nutzer-Feedback: Bei Joker-Empfehlungen fehlt der Hinweis, welcher eigene
Joker ersetzt werden soll. Analyse: Der Shop-Pfad hat das bereits
(„Sell X, buy Y" bei vollen Slots), aber `recommendPackPick` sagt bei
vollen Slots nur „Careful: your joker slots are full" — ohne
Verkaufskandidaten.

## Änderung (`src/engine/recommend.ts` + Tests)

1. Die Schwächster-Joker-Suche aus `evalShopCard` wird in einen Helfer
   `findWeakestOwned(run, phase, profile)` extrahiert (Verhalten des
   Shop-Pfads unverändert; negative Editionen weiterhin ausgenommen).
2. Der Joker-Zweig von `recommendPackPick` nutzt ihn bei vollen Slots:
   - Lohnt der Pick (`score > weakest.value + 1`):
     „Slots full — sell {Name} (worth {X}) to make room".
   - Sonst: „Careful: your joker slots are full and nothing is clearly
     worth selling".

## Nicht-Ziele

Keine Änderung am Shop-Pfad-Verhalten (nur Refactoring), keine UI-Änderung,
keine Behandlung des bekannten Duplikat-Composites (zwei starke Shop-Joker
nennen denselben Schwächsten — bleibt Backlog).

## Tests (2 neue → 90 gesamt)

Volle Slots + starker Pack-Joker → Reason nennt den schwächsten Joker
namentlich; volle Slots + schwacher Pack-Joker → „nothing is clearly worth
selling"-Warnung.
