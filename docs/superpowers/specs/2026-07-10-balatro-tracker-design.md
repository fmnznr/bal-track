# Design: Balatro Shop-Advisor („bal-track")

**Datum:** 2026-07-10
**Status:** Vom Nutzer freigegeben

## Zusammenfassung

Eine mobile Web-App (PWA), die während eines Balatro-Runs als Berater dient.
Der Nutzer spielt auf Mobile, Switch oder Xbox (kein Zugriff auf Savegames
oder Mods möglich) und pflegt den Spielzustand manuell in die App ein —
unterstützt durch eine Autocomplete-Datenbank aller Spielobjekte. Die App
bewertet daraufhin alle Shop-Entscheidungen (kaufen, verkaufen, rerollen,
Pack-Inhalte wählen) per regelbasierter Heuristik-Engine und begründet jede
Empfehlung in Klartext.

## Ziele

- Shop-Entscheidungen bewerten: Joker/Voucher/Pack kaufen, Joker verkaufen,
  Reroll, „nichts kaufen" — inklusive der Wahl beim Öffnen eines Packs.
- Eingabeaufwand minimal halten: pro Shop-Besuch ca. 15–20 Sekunden
  (nur Neues eingeben; der Run-Zustand wird automatisch fortgeschrieben).
- Jede Empfehlung mit nachvollziehbarer Begründung („warum"), keine Orakel-UX.
- Offline-fähig, kostenlos im Betrieb, keine Server-Abhängigkeit.

## Nicht-Ziele (Version 1)

- Kein Tracking des vollständigen 52-Karten-Decks (zu hoher Eingabeaufwand).
- Keine Blind-Skip-Beratung (Blind spielen vs. Tag nehmen) — späterer Ausbau.
- Keine Screenshot-/OCR-Erkennung — die Architektur schließt sie nicht aus,
  aber v1 ist rein manuell.
- Keine KI-/LLM-Anbindung — die Engine ist aber als austauschbare Einheit
  gebaut, sodass eine „Claude-Zweitmeinung" später andockbar ist.
- Keine In-Game-Beratung (welche Hand spielen/discarden).

## Rahmenbedingungen

- **Plattformen des Spielers:** Mobile (iOS), Nintendo Switch, Xbox.
- **Spielsprache & App-Sprache:** Englisch (Kartennamen entsprechen dem
  englischen Original und den Community-Wikis).
- **Nutzungssituation:** App läuft auf dem Handy (zweites Gerät neben
  Konsole, bzw. App-Switcher beim Spielen auf demselben Handy).

## Architektur

Reine Client-Anwendung ohne Backend:

- **Stack:** Vite + React + TypeScript, PWA (Service Worker, installierbar,
  offline-fähig).
- **Katalogdaten:** statische JSON-Dateien, gebündelt mit der App.
- **Persistenz:** localStorage für aktiven Run + Run-Historie; übersteht
  Reload und App-Wechsel.
- **Hosting:** beliebiger statischer Host (GitHub Pages, eigener Webspace).
  Entscheidung beim Deployment; PWA benötigt HTTPS.

### Komponenten

1. **Katalog-Modul** — lädt und indiziert die Spielobjekt-Datenbank,
   stellt Fuzzy-Suche/Autocomplete bereit (kontextsensitiv: im Shop werden
   nur shop-fähige Objekte vorgeschlagen).
2. **Run-Store** — hält den Spielzustand, bietet Aktionen (Kauf bestätigen,
   verkaufen, Werte korrigieren) mit Undo; jede Aktion schreibt den Zustand
   deterministisch fort.
3. **Empfehlungs-Engine** — reine Funktion `(RunState, ShopState) →
   Recommendation[]`; kein UI-, kein Storage-Zugriff; separat testbar und
   austauschbar.
4. **UI** — Screens: Run-Start, Run-Übersicht, Shop, Pack-Öffnung, Historie.

## Datenmodell

### Katalog (statisch)

- **Joker (150):** id, englischer Name, Kosten, Seltenheit, Effekttext,
  Basis-Bewertung je Spielphase (früh: Ante 1–2, mittel: Ante 3–5,
  spät: Ante 6–8), Synergie-Tags (z. B. `xmult`, `plus-mult`, `chips`,
  `flush-support`, `pair-support`, `face-cards`, `economy`, `retrigger`,
  `scaling`).
- **Vouchers (32):** id, Name, Kosten, Effekt, Bewertung, Voraussetzungs-
  Voucher (Basis→Upgrade-Paare).
- **Consumables:** Tarot- (22), Planeten- (12), Spectral-Karten (18) mit
  Effekt und Bewertung; Planeten sind Hand-Typen zugeordnet.
- **Packs:** Typen (Standard, Arcana, Celestial, Buffoon, Spectral) in den
  Größen normal/jumbo/mega mit Kosten und Inhaltslogik (wie viele Optionen,
  wie viele wählbar).
- **Editionen & Modifikatoren:** Foil, Holographic, Polychrome, Negative
  als Bewertungs- und Kosten-Modifikatoren.

Die Bewertungen und Tags werden initial aus dem Community-Konsens
(Tierlists, Wiki) manuell kuratiert und sind als Daten (nicht Code)
jederzeit nachjustierbar.

### Run-Zustand (vom Nutzer gepflegt)

- Deck, Stake (einmalig beim Run-Start).
- Ante, Geld (bei jedem Shop-Besuch aktualisiert).
- Joker im Besitz, je mit Edition; Joker-Slot-Anzahl.
- Eingelöste Vouchers.
- Gehaltene Consumables; Consumable-Slot-Anzahl.
- Hand-Level: werden automatisch aus genommenen/gekauften Planetenkarten
  fortgeschrieben, manuell korrigierbar.
- Ereignis-Log für Undo und Historie.

## Bedienablauf

1. **Run-Start:** Deck und Stake wählen — zwei Antipper.
2. **Run-Übersicht (Hauptscreen):** Joker-Leiste, Geld, Ante, Vouchers —
   alles direkt antippbar und editierbar.
3. **Shop-Besuch:** Shop-Inhalt per Autocomplete eingeben (Kartenslots —
   standardmäßig 2, durch Overstock-Vouchers erweiterbar —, Voucher,
   2 Packs), Geldstand setzen. Das Empfehlungs-Panel aktualisiert
   sich live bei jeder Eingabe: sortierte Aktionsliste mit je einem
   Begründungssatz. Kauf antippen = Zustand wird fortgeschrieben.
4. **Pack-Öffnung:** Optionen des Packs eingeben → Empfehlung, welche
   Karte(n) zu nehmen sind; Auswahl wird in den Zustand übernommen
   (Planeten erhöhen z. B. das passende Hand-Level).
5. **Run-Ende:** Run als gewonnen/verloren abschließen → Historie.

## Empfehlungs-Engine

Bewertung jeder möglichen Aktion als Punktwert aus gewichteten Faktoren:

- **Basiswert** des Objekts in der aktuellen Spielphase (aus dem Katalog).
- **Archetyp-Fit:** Übereinstimmung der Synergie-Tags mit dem aus den
  vorhandenen Jokern erkannten Build (z. B. viele `flush-support`-Tags →
  Flush-Build; passende Neuzugänge werden aufgewertet).
- **Ökonomie:** Zins-Schwellen (jede volle 5 $ bis 25 $ ergeben 1 $ Zins);
  ein Kauf, der unter eine Schwelle drückt, wird abgewertet — außer der
  strategische Wert überwiegt. Reroll-Kosten und verbleibende Kaufkraft
  fließen ein.
- **Slot-Knappheit:** volle Joker-Leiste erzwingt Verkaufs-Abwägung —
  schwächster vorhandener Joker vs. Shop-Angebot (inkl. Verkaufserlös).
- **Pack-Erwartungswert:** je Pack-Typ und Spielphase (z. B. Celestial
  früh stark, Standard-Pack meist schwach).
- **Voucher-Langfristwert** gegen Restlaufzeit des Runs.

Output: `Recommendation[]` — Aktion, Punktwert, Confidence,
Begründungssätze. Die UI zeigt die Liste sortiert; „nichts kaufen" und
„Reroll" sind reguläre Aktionen im Ranking.

Ehrlichkeits-Prinzip: Die App kommuniziert Empfehlungen als fundierte
Heuristik mit Begründung, nicht als objektive Wahrheit.

## Korrigierbarkeit & Fehlertoleranz

- Jeder Wert des Run-Zustands ist jederzeit manuell änderbar.
- Undo für jede Aktion (Ereignis-Log).
- Divergenz zwischen App und Spiel (vergessene Eingabe) wird durch
  Korrektur behoben, nie durch Neuanfang.
- Kein Datenverlust bei Reload/App-Wechsel (localStorage).

## Testen

- **Engine:** Unit-Tests mit konstruierten Spielsituationen und erwarteter
  Empfehlungs-Rangfolge (inkl. Ökonomie-Kanten wie Zins-Schwellen).
- **Katalog:** Validierungs-Tests — Vollständigkeit (150 Joker, 32
  Vouchers, …), Pflichtfelder, plausible Kosten/Seltenheiten.
- **Run-Store:** Zustandsfortschreibung und Undo deterministisch getestet.
- **UI:** Smoke-Tests der Kernabläufe (Run-Start → Shop → Kauf → Pack).

## Spätere Ausbaustufen (bewusst nicht in v1)

1. Claude-API-Zweitmeinung als zweite, optionale Engine.
2. Screenshot-Erkennung als alternative Eingabe.
3. Blind-Skip-Beratung (Tags).
4. Statistiken über die Run-Historie.

## Offene Punkte

- **Hosting-Ziel** (GitHub Pages vs. eigener Webspace): Entscheidung beim
  Deployment, blockiert nichts.
- **Kuratierung der Bewertungen:** initiale Tierlist-Einpflege ist der
  größte Content-Aufwand; wird im Implementierungsplan als eigener
  Arbeitsschritt geführt.
