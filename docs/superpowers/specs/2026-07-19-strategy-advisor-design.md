# Design: Strategieberater für bal-track

**Datum:** 2026-07-19
**Status:** Vom Nutzer freigegeben
**Baut auf:** `2026-07-10-balatro-tracker-design.md` (Version 1 der App, live auf GitHub Pages)

## Zusammenfassung

Die App bekommt einen Strategieberater: Sie erkennt früh im Run — aus den
bereits aufgetauchten Jokern und dem gespielten Deck — welche Build-Strategie
sich anbietet, zeigt das prominent auf dem Run-Screen an und lässt die
Empfehlung moderat in die bestehende Shop- und Pack-Beratung einfließen.

## Ziele

- Auf dem Run-Screen jederzeit sichtbar: Welche Strategie(n) bieten sich an,
  wie sicher ist die Einschätzung, und warum?
- Deck-abhängig: Jedes der 15 Decks beeinflusst die Bewertung (Boni und
  harte Ausschlüsse).
- Ehrlichkeit: Früh im Run mit wenig Signal lautet die Antwort „Open — stay
  flexible", nicht eine erzwungene Empfehlung.
- Rückkopplung: Ab erkennbarer Tendenz werden Shop-Angebote und Pack-Picks,
  die zur empfohlenen Richtung passen, moderat aufgewertet — mit eigener
  Begründungszeile.

## Nicht-Ziele (dieser Ausbaustufe)

- Kein manuelles Festpinnen einer Strategie durch den Nutzer (spätere Stufe).
- Keine Berücksichtigung von Boss-Blinds oder Tags.
- Kein Deck-Kompositions-Tracking (bleibt wie in v1 ausgeklammert).
- Keine KI-/API-Anbindung.

## Datenmodell

### Archetyp-Katalog (`src/data/archetypes.json`)

Sechs Archetypen, kuratiert im Stil des Joker-Katalogs:

| id | Name | Kern-Tags | Hände |
|---|---|---|---|
| flush | Flush | flush-support, suit-* | Flush |
| straight | Straight | straight-support | Straight |
| pairs | Pairs & Four of a Kind | pair-support | Pair, Two Pair, Full House, Four of a Kind |
| face-cards | Face Cards | face-cards | (keine spezifischen) |
| scaling | Scaling Engine | scaling, xmult | (keine spezifischen) |
| economy | Economy Start | economy | (keine spezifischen) |

Pro Eintrag: `id`, `name`, `description` (ein Anzeigesatz), `coreTags`
(Werte aus `SYNERGY_TAGS`), `keyJokers` (4–6 Joker-Ids als Watchlist),
`hands` (`HandType`-Werte zum Leveln). „suit-*" in der Tabelle steht für
die vier ausgeschriebenen Tags `suit-hearts`, `suit-diamonds`,
`suit-spades`, `suit-clubs` — im JSON werden sie einzeln gelistet.

### Deck-Tabelle (`src/data/deckStrategy.json`)

Für alle 15 Decks: `boosts` (Archetyp-Id → Modifikator, typ. +1 bis +3),
`excluded` (Archetyp-Ids, die mit diesem Deck nicht spielbar sind) und
`note` (Anzeigetext). Kernfälle: Checkered → flush +3; Abandoned →
face-cards ausgeschlossen, pairs/straight +1; Plasma/Black → scaling +1;
Yellow → economy +1; Painted → flush/straight +1. Neutrale Decks haben
leere Einträge. Validierungstests sichern: alle 15 Decks vorhanden,
alle referenzierten Archetyp-/Joker-/Tag-/Hand-Ids existieren.

## Strategie-Engine (`src/engine/strategy.ts`)

Pures Modul ohne React/DOM, wie die bestehende Engine:

```
adviseStrategy(run: RunState) → StrategyAdvice
```

- **Scoring je Archetyp:** Summe aus (a) Tag-Treffern der vorhandenen Joker
  auf `coreTags` (stärkster Faktor), (b) bereits besessenen Watchlist-Jokern
  (Zusatzbonus), (c) Deck-Bonus aus der Tabelle, (d) bereits gelevelten
  passenden Händen. Vom Deck ausgeschlossene Archetypen werden gefiltert.
- **Commitment-Stufen** aus dem Top-Score: `commit` (klare Sache),
  `lean` (Tendenz), `open` (kein ausreichendes Signal — Standard bei leerem
  Run). Schwellenwerte sind Konstanten im Modul, per Tests fixiert.
- **Ergebnis:** `StrategyAdvice` mit Stufe und Top-3-Kandidaten; je Kandidat
  Name, Score, Begründungssätze und Watchlist (nur noch nicht besessene
  Joker).

## Shop-/Pack-Rückkopplung (`src/engine/recommend.ts`)

- `recommend()` und `recommendPackPick()` rufen `adviseStrategy` auf.
- Ab Stufe `lean`: Shop-Joker mit Schnittmenge zu den `coreTags` des
  Top-Archetyps erhalten einen moderaten Bonus plus Begründung
  („Fits your recommended flush plan"); Watchlist-Joker einen etwas
  höheren. Beide Boni sind bewusst kleiner als der bestehende
  Besitz-Synergie-Bonus — vorhandene Joker dominieren weiterhin.
- Pack-Picks: Planetenkarten, deren Hand zu den `hands` des Top-Archetyps
  gehört, werden zusätzlich zur bestehenden Besitz-Affinität aufgewertet.
- Bei Stufe `open` ändert sich am Shop-Scoring nichts.

## UI (`src/ui/components/StrategyPanel.tsx`)

Neue Komponente, eingebunden ganz oben im Run-Screen:

- Kopfzeile: Commitment-Stufe als farbiger Chip (Open grau, Lean blau,
  Commit grün) + Name des Top-Archetyps.
- Darunter 2–3 Begründungssätze und die Watchlist („Look for: …").
- Weitere Kandidaten einklappbar (`<details>`), analog Hand-Levels.
- Kein eigener State: rendert live aus `adviseStrategy(run)`.

## Testen

- **Daten:** Validierung von `archetypes.json` (6 Einträge, gültige
  Tag-/Joker-/Hand-Referenzen) und `deckStrategy.json` (alle 15 Decks,
  gültige Archetyp-Referenzen).
- **Engine:** Szenarien — leerer Run → `open`; Checkered + 1 Flush-Joker →
  mindestens `lean` für flush; Abandoned zeigt face-cards nie (auch wenn
  ein Bildkarten-Joker besessen wird); Watchlist enthält nur nicht
  besessene Joker; zwei Flush-Joker auf neutralem Deck → flush vor pairs.
- **Rückkopplung:** Shop-Joker mit passendem Tag erhält bei `lean` die
  Strategie-Begründungszeile; bei `open` nicht.
- **UI:** Smoke-Test — Panel zeigt „Open" bei frischem Run und wechselt
  nach Eintragen zweier Flush-Joker auf den Flush-Kandidaten.

## Koordination

Der separat laufende Folgetask „Joker-Effekttext in Empfehlungen anzeigen"
ändert ebenfalls `src/engine/recommend.ts`. Der Implementierungsplan nimmt
den dann aktuellen `main` als Basis und integriert dessen Änderung, falls
sie bis dahin gelandet ist.

## Spätere Ausbaustufen

1. Manuelles Festpinnen einer Strategie (Overlay über die Empfehlung).
2. Berücksichtigung von Vouchers im Strategie-Scoring (z. B. Observatory
   → scaling/Planeten).
3. Boss-Blind-Warnungen je Strategie.
