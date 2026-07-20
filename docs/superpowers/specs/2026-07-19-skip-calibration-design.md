# Design: Skip-Kalibrierung (Eco-bewusstes „Buy nothing")

**Datum:** 2026-07-19 · **Status:** Vom Nutzer freigegeben (Option „Ja, genau so")

## Problem

„Buy nothing" ist zwar immer im Ranking, erreicht aber maximal ~3,75 Punkte
und verliert damit gegen fast jeden leistbaren Kauf. Praxisbeobachtung des
Nutzers: Skip wurde erst bei 5 $ (alles unbezahlbar) zur Top-Empfehlung.
Guter Balatro-Play spart aber gerade früh Richtung 25-$-Zins-Cap.

## Änderung (nur `evalSkip` in `src/engine/recommend.ts` + Tests)

`evalSkip` erhält `phase` und den aktiven Strategie-`plan` als Parameter und
bekommt drei additive Boni:

1. **Zins-Aufbau:** Solange `interest(money) < cap`: früh +1, mittel +0,5,
   spät +0. Begründung: "Growing your interest pays off every remaining
   round".
2. **Schwellen-Hinweis:** Fehlen 1–2 $ zur nächsten 5-$-Stufe (und Zins
   nicht am Cap): +0,5 mit "Save $X more to reach the next interest tier".
3. **Economy-Plan:** Ist der empfohlene Archetyp `economy`: +1 mit
   "Banking fits your recommended Economy Start plan".

Unverändert: Basis 3 + Zins-Bonus, der −1,5-Dämpfer bei starkem Kauf
(bestBuy ≥ 7) — starke Joker gewinnen weiterhin gegen Skip.

## Kalibrier-Nachweis (handgerechnet)

- Ante 1, 13 $, 5/10-Joker für 6 $: Kauf 4,2 vs. Skip 4,8 → **Skip gewinnt** (neu).
- Ante 1, 13 $, Blueprint für 10 $: Kauf 5,4 vs. Skip 4,8 → **Kauf gewinnt** (unverändert richtig).
- Alle 82 Bestandstests bleiben gültig (gegen jede Fixture geprüft; im
  Weak-Buy-Szenario wird Skip statt Reroll Top — die Assertion prüft nur
  „nicht der Kauf").

## Tests (4 neue in recommend.test.ts → 86 gesamt)

Mediocre-Buy-früh → Skip top; starker Joker → Kauf top; „Save $2 more" bei
23 $; Economy-Plan-Begründung bei golden-joker+bull.

## Nicht-Ziele

Keine Änderung an Reroll/Voucher/Pack/Kauf-Scoring, keine UI-Änderung
(Reihenfolge der Liste erledigt die Sichtbarkeit).
