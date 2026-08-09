# Design: Persistente Shop-/Pack-Entwürfe

**Datum:** 2026-07-19 · **Status:** Vom Nutzer freigegeben

## Problem

Nutzer-Feedback: Beim Wechsel vom Shop-Tab zum Run-Tab (und zurück) sind
alle Shop-Eingaben weg. Ursache: `ShopScreen` und `PackScreen` halten ihre
Eingaben in lokalem Komponenten-State; der Tab-Wechsel entlädt die
Komponente. Auf Mobile trifft dasselbe beim App-Wechsel zu Balatro und
zurück (Seiten-Reload durch iOS).

## Änderung

Die Eingaben werden Entwürfe im persistierten Store (`runStore`):

- `StoreState` erhält `shopDraft: ShopState | null` und
  `packDraft: { kind: PackKind; options: string[] } | null`.
- Neue Aktionen `SET_SHOP_DRAFT` / `SET_PACK_DRAFT` — bewusst OHNE
  Undo-Snapshot (Entwürfe sind keine Run-Mutationen und sollen die
  Undo-Historie nicht verschmutzen); nur bei aktivem Run wirksam.
- `START_RUN` und `END_RUN` leeren beide Entwürfe.
- `load()` normalisiert alte Spielstände (fehlende Felder → `null`) —
  kein Datenverlust bei bestehenden Runs.
- `ShopScreen` bindet an `store.shopDraft ?? emptyShop` (Adapter mit der
  bisherigen funktionalen Update-Signatur), `PackScreen` an
  `store.packDraft` (Pack-Art + Optionen; die flüchtige Hinweiszeile
  bleibt lokal). „Clear shop"/„Clear" funktionieren unverändert.

## Nicht-Ziele

Keine UI-Umgestaltung, keine Mehrfach-Entwürfe, kein Draft für den
Setup-Screen.

## Tests (6 neue → 96 gesamt)

Store: Draft-Setzen ohne past-Wachstum; Leeren bei END_RUN/START_RUN;
save/load-Roundtrip; Migration alter Saves. UI: Shop-Karte und
Pack-Option überleben je einen Tab-Roundtrip.
