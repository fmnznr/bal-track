# Design: Deck-Profil (Aggregat-Zähler)

**Datum:** 2026-07-19 · **Status:** Vom Nutzer freigegeben (halbautomatisch, Ansatz A)

## Zusammenfassung

Der Run-Zustand erhält ein halbautomatisch gepflegtes Deck-Profil auf
Aggregat-Ebene — Karten je Farbe, Face-Card-Anzahl, Deckgröße, Enhanced-
Zähler je Typ. Die Empfehlungs-Engine nutzt es für ehrlichere Bewertungen
(Farb-Joker, Face-Joker, Enhanced-Spezialisten, Flush-Strategie). Kein
Einzelkarten-Tracking.

## Datenmodell

```
ENHANCEMENT_TYPES = bonus | mult | wild | glass | steel | stone | gold | lucky
DeckProfile {
  suits: { hearts, diamonds, spades, clubs }: number
  faceCards: number
  deckSize: number
  enhanced: Record<EnhancementType, number>
}
```

`RunState.deckProfile: DeckProfile`. Initialwerte je Deck beim Run-Start:
Standard-Decks 13/13/13/13, 12 Face, 52 Karten, Enhanced 0; Checkered
26 Pik / 26 Herz / 0 / 0, 12 Face; Abandoned 10/10/10/10, 0 Face,
40 Karten. Erratic startet wie Standard, die UI zeigt dort den Hinweis,
die Werte zu prüfen.

**Migration:** `load()` rüstet Spielstände ohne `deckProfile` automatisch
mit dem Initialprofil des gespeicherten Decks nach (auch für Snapshots in
`past` unnötig — Undo stellt nur Zustände wieder her, die nach der
Migration entstanden sind; alte Snapshots werden beim Laden mitmigriert).

## Halbautomatik

Effekt-Tabelle `CONSUMABLE_PROFILE_EFFECTS` (Daten im Engine-Modul), die
bei `USE_CONSUMABLE` und bei Pack-Picks (neue Aktion `APPLY_CONSUMABLE`)
angewendet wird:

- the-chariot → steel +1 · justice → glass +1 · the-devil → gold +1 ·
  the-tower → stone +1 · the-lovers → wild +1
- the-magician → lucky +2 · the-empress → mult +2 · the-hierophant →
  bonus +2
- familiar → deckSize +2, faceCards +3 · grim → deckSize +1 ·
  incantation → deckSize +3
- the-hanged-man → deckSize −2 · immolate → deckSize −5
- Konvertierer (the-star ♦ / the-sun ♥ / the-moon ♣ / the-world ♠):
  ein Mini-Prompt (SuitPrompt) erfragt die 1–3 Quellfarben per Tap;
  bei Bestätigung wird atomar gebucht (Quellen −, Zielfarbe + um die
  Tap-Anzahl). Bei Abbruch wird nichts gebucht, nur der Hinweis auf
  manuelle Korrektur gezeigt — so bleiben die Farbsummen konsistent.

Nicht automatisiert (nur Hinweistext „Profil ggf. anpassen"): sigil,
ouija, Standard-Pack-Karten, cryptid, Deck-Änderungen durch Boss-Blinds.
Alle Zähler bleiben manuell editierbar; Untergrenze 0.

## Engine-Hooks (`src/engine/deckSignals.ts`, pur)

- `suitShare(profile, suit)` und `faceShare(profile)`.
- **Farb-Joker** (Tags suit-*): Anteil 0 → Score auf 1 gedeckelt, Reason
  „No {suit} cards left in your deck"; < 15 % → −2; > 40 % → +1,5.
  Gilt in Shop-, Pack- und Besitz-Bewertung (Verkaufskandidaten!).
- **Flush-Strategie:** max. Farbanteil > 40 % → +1,5 im Strategie-Scoring
  (zusätzlich zur statischen Deck-Tabelle), Reason mit Prozentangabe.
- **Face-Joker** (Tag face-cards): faceShare 0 → Deckel 1 („no face cards
  in your deck"); < 15 % → −1,5; > 30 % → +1.
- **Enhanced-Spezialisten** (Hook-Tabelle je Joker-Id): steel-joker →
  +0,5 je Steel Card (max +3) mit Zähler-Reason; glass-joker analog zu
  Glass; drivers-license → gesamt-Enhanced ≥ 16 → +3, sonst −2 mit
  „only N/16 enhanced cards".
- Mehrfarben-Joker (Blackboard) werden über die Summe ihrer Farben bewertet
  (Boost erst ab 70 %); Face-Enabler (Pareidolia) sind vom Face-Signal
  ausgenommen; bei deckSize 0 werden keine Anteils-Aussagen getroffen.

## UI

- Run-Screen: einklappbare Sektion „Deck profile" (Stil Hand-Level):
  4 Farb-Zähler, Face Cards, Deck size; Enhanced-Typen als Zeilen nur wenn
  ≠ 0, plus kompakte „+"-Leiste zum Erst-Setzen. Erratic-Hinweis.
- `SuitPrompt`-Komponente inline in PackScreen und RunOverview nach
  Anwendung eines Konvertierers.

## Tests

Migration (alter Save → Initialprofil), Initialprofile (Standard/
Checkered/Abandoned), jede Auto-Buchung der Effekt-Tabelle, Konvertierer-
Flow mit und ohne Prompt-Antwort, Engine-Fälle (Greedy bei 0 Karo →
Deckel + Reason; Steel Joker mit 4 Steel → Bonus; Driver's License unter
16 → Warnung; Flush-Boost über 40 % Farbanteil), UI-Smoke (Sektion
rendert, Zähler-Edit dispatcht, SuitPrompt-Flow).

## Nicht-Ziele

Einzelkarten-Tracking, Seals, Rang-Verteilung jenseits Face Cards,
Boss-Blind-Effekte, Sigil/Ouija-Automatik.

## Spätere Ausbaustufen

Aus dem Opus-Review von Task 3 zurückgestellte Punkte:

- Kontextsensitive Verkaufs-Bewertung für Enhanced-Spezialisten (Driver's
  License früh im Run nicht als Verkaufskandidat vorschlagen, auch wenn
  der aktuelle Enhanced-Anteil niedrig ist).
- Kopplung deckSize ↔ Farbzähler gegen Drift (manuelle Edits können beide
  auseinanderlaufen lassen; ein Konsistenz-Check oder Ableitung wäre
  robuster).
- Plan-Reasons auf gedeckelten Karten unterdrücken (wenn deckSignalForJoker
  bereits capAt setzt, wirkt ein zusätzlicher „fits your recommended plan"-
  Reason irreführend).
- Fast-16-Hinweis für Driver's License (z. B. bei 12–15 Enhanced-Karten
  einen „fast da"-Reason statt nur der pauschalen Warnung unter 16).
