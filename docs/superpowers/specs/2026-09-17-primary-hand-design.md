# Primary hand replaces per-hand play counters

Supersedes the input side of
[`2026-08-10-hand-play-tracking-design.md`](2026-08-10-hand-play-tracking-design.md).
That design's signals were sound; the way it collected their input was not.

## Problem

Hand-play tracking asked the player to maintain thirteen numbers by hand — one
counter per hand type plus discards used — during a run, on a second device.
Nothing in the app booked them automatically, so they were the only inputs
requiring continuous bookkeeping while playing. In practice that was the
feature that stopped people using the app.

The cost was not visibility. The fields already lived in a collapsed
`<details>` section. The cost was that advice quality visibly depended on them,
so the player felt obliged to keep them current.

## Decision

`RunState.handPlays` and `RunState.discardsUsed` are replaced by a single
`primaryHand: HandType | null`, declared once per run from a select on the run
screen. `OwnedJoker.acquiredAtPlays` / `acquiredAtDiscards` go with them.

What the declared hand now drives:

| Consumer | Before | After |
| --- | --- | --- |
| `referenceHand` | most played hand above 8 plays | declared hand |
| Planet bonus | matches most played hand | matches declared hand |
| `adviseStrategy` | play share, ramped by sample size | +3 when the archetype covers the declared hand |
| Supernova | scaled with plays of the best hand | flat +1 once any hand is declared |
| Obelisk | scaled with concentration | flat −1.5 once any hand is declared |
| Green Joker, Ice Cream | scaled since acquisition | removed — no data source remains |

Banner and Delayed Gratification are unaffected: they read
`discardsPerRound`, which vouchers and the deck already book automatically.

## Trade-off accepted

The four joker signals get coarser or disappear. A declared hand says the
player is consistent, not how often they have played it, so Supernova and
Obelisk become flat nudges rather than curves, and the two signals that needed
per-joker history are gone.

In exchange the routine input cost of a run drops to one select. Every
remaining number on the run screen is either core state the player already
tracks (money, ante, joker slots) or a correction to something the app booked
itself.

## Migration

Storage moves to `bal-track:v3`, reading `v2` and `v1`. A v2 run adopts its
most played hand as `primaryHand`, using the same 8-play floor the old signals
applied before they would read the counters at all; below that it migrates to
`null`. The retired per-joker acquisition counters are stripped.

## Consequence for the score model

`referenceHand` no longer has a confidence notion, so the score estimate
describes a hand the player chose rather than one inferred from a sample. This
makes the estimate easier to reason about and is a precondition for putting the
recommendation scale on a single defined axis later.
