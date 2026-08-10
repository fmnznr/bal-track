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

`checkJokerOrder(run) → OrderIssue[]`, jede Issue mit `message` und
optionalem `from`/`to` für den Vorschlag:

1. **xmult-left-of-plus-mult:** Ein `xmult`-Joker links von einem
   `plus-mult`-Joker verschenkt Wert ((Basis+n)×m > Basis×m+n).
   Meldung nennt beide Namen und schlägt den Tausch vor.
2. **blueprint-rightmost:** Blueprint auf dem letzten Platz kopiert nichts.
3. **blueprint-weak-target:** Blueprints rechter Nachbar ist nicht der
   stärkste kopierbare Joker.
4. **brainstorm-leftmost:** Brainstorm ganz links kopiert sich selbst.
5. **brainstorm-weak-target:** Der linkeste Joker ist nicht der stärkste
   (Brainstorm kopiert immer den linkesten).

„Stärke" ist `ownedJokerValue` aus `recommend.ts` (wird dafür exportiert) —
dieselbe Bewertung wie bei Verkaufsempfehlungen, inklusive Deck-Profil.

## Vorschlags-Algorithmus (`suggestJokerOrder(run) → number[] | null`)

Liefert eine Permutation der aktuellen Indizes oder `null`, wenn die
aktuelle Reihenfolge bereits passt. Stabil: Was mechanisch egal ist, bleibt
wo es ist.

1. Kopier-Joker (blueprint, brainstorm) herausnehmen.
2. Rest nach Kategorie stabil sortieren: neutral → `plus-mult` → `xmult`
   (ein Joker mit beiden Tags zählt als `xmult`).
3. Ist Brainstorm im Besitz: den stärksten Rest-Joker nach vorn holen.
4. Ist Blueprint im Besitz: Blueprint direkt links vom stärksten Rest-Joker
   einfügen — ist dieser wegen Regel 3 auf Position 0, dann links vom
   zweitstärksten (Position 0 bleibt Brainstorms Ziel).
5. Ist Brainstorm im Besitz: Brainstorm ans Ende (nie ganz links).

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
fünf Regeln einzeln, Mehrfachverstöße, sauberer Fall, Vorschlags-Stabilität, `null` bei bereits guter
Reihenfolge, UI (Verschieben, Warnung sichtbar, Auto-Sortieren wirkt).
Neutrale Joker müssen dabei ihre relative Reihenfolge behalten.
