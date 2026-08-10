# Design: Joker-Reihenfolge-Beratung

**Datum:** 2026-08-09 · **Status:** Vom Nutzer freigegeben (inkl. Auto-Sortieren)

## Zusammenfassung

Die Joker-Liste wird zur echten Spielreihenfolge: Der Nutzer kann Joker
verschieben, die App warnt vor mechanisch teuren Positionsfehlern und bietet
auf Wunsch eine optimierte Reihenfolge per Knopfdruck an. In Balatro triggern
Joker von links nach rechts — die Reihenfolge ist real spielentscheidend.

## Ziele

- Joker in der App-Liste verschieben (Pfeil-Buttons, Positionsnummern).
- Konkrete, begründete Warnungen bei Positionsfehlern.
- Ein „Apply suggested order"-Knopf, der eine regelkonforme Reihenfolge in
  einem Schritt herstellt (ein Undo-Schritt).

## Nicht-Ziele

Retrigger-Feinheiten, Joker Stencil / Baseball Card-Sonderfälle,
Drag & Drop, automatisches Sortieren ohne Nutzeraktion.

## Regeln (`src/engine/jokerOrder.ts`, pur)

**Leitprinzip (nach Review-Überarbeitung):** Es wird nur gewarnt, wo die
Mechanik eindeutig ist. Ein früher Entwurf verglich „Stärken" von Jokern und
forderte den stärksten nach links — das widersprach der Mult-Regel und war
für viele Aufstellungen unerfüllbar. Statt Stärkevergleichen gilt jetzt die
binäre, unstrittige Frage: **Punktet der kopierte Joker überhaupt?**

`checkJokerOrder(run) → OrderIssue[]`:

1. **xmult-before-plus-mult:** `xmult`-Joker links von einem `plus-mult`-Joker
   verschenken Wert ((Basis+n)×m > Basis×m+n). Eine gesammelte Meldung für
   alle Betroffenen. Editionen zählen mit: Polychrome wirkt wie `xmult`,
   Holographic wie `plus-mult`.
2. **blueprint-rightmost:** Jedes Blueprint auf dem letzten Platz kopiert
   nichts (geprüft für alle Blueprints, nicht nur das erste).
3. **blueprint-weak-target:** Blueprints rechter Nachbar punktet nicht,
   obwohl ein punktender Nicht-Kopier-Joker existiert.
4. **brainstorm-leftmost:** Brainstorm ganz links kopiert sich selbst.
5. **brainstorm-weak-target:** Der linkeste Joker punktet nicht, obwohl ein
   punktender Nicht-Kopier-Joker existiert.

Kopier-Joker gelten als gültige Ziele — Blueprint↔Brainstorm-Ketten sind
eine echte Strategie, keine Fehlstellung.

## Vorschlags-Algorithmus (`suggestJokerOrder(run) → number[] | null`)

Permutation der aktuellen Indizes oder `null`. Stabil: Was mechanisch egal
ist, bleibt wo es ist.

1. `null`, wenn `checkJokerOrder` nichts findet (kein Umsortieren ohne Anlass).
2. Nicht-Kopier-Joker stabil nach Kategorie sortieren: `plus-mult` → `xmult`,
   positionsneutrale Joker davor — **oder dahinter, wenn Brainstorm im Besitz
   ist**, damit Slot 1 punktet, ohne die Mult-Reihenfolge zu brechen.
3. Alle Blueprints zusammenhängend direkt links vom letzten punktenden
   Joker einfügen; gibt es keinen, an den Anfang (nie ganz rechts).
4. Alle Brainstorms ans Ende (nie ganz links).
5. **Garantie:** Ein Vorschlag wird nur zurückgegeben, wenn er die Zahl der
   Beanstandungen echt senkt — sonst `null`. Damit kann der Knopf nie
   wirkungslos sein und nie oszillieren.

## Store

- `MOVE_JOKER { index, direction }` — tauscht mit dem Nachbarn, Ränder sind
  No-ops (kein Undo-Schritt).
- `SET_JOKER_ORDER { order: number[] }` — wendet eine Permutation an; keine
  gültige Permutation ⇒ No-op. Beide mit Undo-Snapshot.

## UI

- Joker-Zeile: Positionsnummer, dann ◀/▶ (aria-label „move {Name} left/right",
  an den Rändern deaktiviert), danach wie bisher Edition und Verkaufen.
- Darunter `JokerOrderPanel`: Warnungen als Liste; bei Bedarf der Knopf
  „Apply suggested order"; ohne Befund die Zeile „Joker order looks good".
  Erst ab 2 Jokern sichtbar.

## Tests

Store (Verschieben inkl. Ränder/Undo, Permutation gültig/ungültig), jede der
fünf Regeln einzeln, Mehrfachverstöße, sauberer Fall, Kopier-Ketten,
Editionen, doppelte Kopier-Joker, `null` bei bereits guter Reihenfolge,
UI (Verschieben, Warnung sichtbar, Auto-Sortieren wirkt). Neutrale Joker
behalten ihre relative Reihenfolge. Eine Invarianten-Prüfung über mehrere
Aufstellungen sichert zu: jeder Vorschlag ist eine gültige Permutation,
senkt die Beanstandungen echt und ist ein Fixpunkt (kein Oszillieren).

## Bewusst offen (Backlog aus dem Review)

- Blueprint/Brainstorm zielen nur auf „punktet ja/nein", nicht auf den
  *besten* Ziel-Joker — ein belastbarer Kopierwert (statt der Verkaufs-
  Heuristik) wäre dafür nötig.
- Retrigger-Feinheiten und Joker Stencil / Baseball Card bleiben außen vor.
