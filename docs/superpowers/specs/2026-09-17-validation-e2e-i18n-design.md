# Catalog validation, end-to-end coverage, and a second language

Three independent pieces of hardening, grouped because none is big enough to
stand alone.

## Catalog validation

The engine read every JSON file through `as unknown as`, which asserts a shape
rather than checking one. A misspelled tag compiled cleanly and surfaced only as
a joker that quietly scored nothing.

`src/data/schema.ts` closes the gap from both sides:

- `npm run validate:catalog` parses every file and fails, naming the offending
  entry by id. It runs in CI and again inside `npm run build`, so bad data
  cannot reach a deploy.
- A compile-time assignability check fails `tsc` if a schema drifts from the
  hand-written type the engine consumes.

The second half took two attempts. The first was written as
`type Satisfies<S, T> = S extends T ? true : never`, which proves nothing: a
type that evaluates to `never` is still a valid type and compiles silently.
Weakening the schema on purpose confirmed it caught nothing. Putting the check
in a *generic constraint* — `type AssertAssignable<A extends E, E> = A` — does
fail, which the same experiment then confirmed.

Zod is a devDependency, imported only by the schema module and its test, so none
of it reaches the bundle.

## End-to-end smoke coverage

The vitest suite renders screens in jsdom, one at a time, driving the reducer
directly. Three things it structurally cannot check: whether the built app boots
in a real browser, whether state survives an actual reload through localStorage,
and whether the offline promise in the README holds.

`e2e/smoke.spec.ts` runs against the **production build**, not a dev server,
because that is what gets deployed. It walks a run from setup through a shop
purchase to a reload and an undo, switches language across a reload, and takes
the app offline.

It found a real defect immediately: the deployed app declared no favicon, so
every page load 404'd on the browser's implicit `/favicon.ico` request. Fixed by
declaring the existing PWA icon.

The offline test was flaky on its first pass — it went offline before the
service worker had claimed the page, which fails with
`ERR_INTERNET_DISCONNECTED` whether or not the app is offline capable. It now
waits for `navigator.serviceWorker.controller`, and a timeout there would be a
genuine failure rather than a race. Verified stable over repeated runs.

CI installs its own browser; `PLAYWRIGHT_CHROMIUM_PATH` lets an environment that
already ships one skip the download.

## English and German

`src/i18n/` holds a dictionary keyed the same way in both languages, with the
German table typed as `Record<keyof typeof en, string>`, so a missing
translation is a compile error rather than a silent English fallback. Language
comes from the player's stored choice, else the browser, else English, and a
switch sits in the header.

Tests assert that both tables carry the same keys, that no phrase is empty, that
placeholders survive translation, and that the German table is not simply a copy
of the English one.

### What is deliberately not translated

**Game terms stay English in both languages.** Joker, voucher, deck and poker
hand names are the words Balatro prints on the screen the player is looking at;
translating them would make the app harder to use, not easier. A German player
reads "Joker-Plätze (0/5)" above a list containing "Blueprint".

**Engine advice text is English only.** Those sentences are assembled by
interpolating game terms across six engine modules, and `src/engine/` has no
business importing a dictionary. Keying roughly sixty message templates is its
own piece of work with its own design question — whether reasons become
structured data rather than strings — and it would have cost the engine the
readability the project has otherwise protected. The README says so plainly
rather than leaving a player to discover it.
