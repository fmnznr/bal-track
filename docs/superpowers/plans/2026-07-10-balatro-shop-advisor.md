# Balatro Shop Advisor ("bal-track") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mobile-first PWA where a Balatro player manually enters their run state and each shop's contents, and gets ranked, explained recommendations for every shop decision (buy/sell/reroll/skip, voucher, pack, and pack-content picks).

**Architecture:** Pure client-side single-page app, no backend. A static catalog (all jokers, vouchers, consumables, packs) ships as JSON. Run state lives in a pure reducer persisted to localStorage. The recommendation engine is a pure function `(RunState, ShopState) → Recommendation[]` with no UI or storage dependencies.

**Tech Stack:** Vite + React 18 + TypeScript (strict), Vitest + Testing Library (jsdom), vite-plugin-pwa. No other runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-07-10-balatro-tracker-design.md` (approved by user).

---

## Execution notes

- Working directory: `/Users/franzmuenzner/Downloads/aufheben/bal-track` (git repo exists, branch `main`).
- Commit after every task with the message given in the task. Append the standard co-author trailer used in this repo:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- TDD: for each task, write the test first, watch it fail, implement, watch it pass.
- `npm install` happens once in Task 1; later tasks add no dependencies.
- Task 4 requires transcribing game data from the Balatro wiki (`https://balatrogame.fandom.com/wiki/Jokers`). Use WebFetch. Everything else is fully specified in this document.
- All UI copy is English (user decision).

## File structure

```
bal-track/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .gitignore
├── scripts/
│   └── gen-icons.mjs            # Task 19: writes public/pwa-192.png / pwa-512.png
├── public/                      # icons land here (generated, committed)
└── src/
    ├── main.tsx                 # entry
    ├── App.tsx                  # shell + tab navigation
    ├── App.test.tsx             # run-start smoke test
    ├── styles.css               # single stylesheet, dark mobile theme
    ├── test-setup.ts            # jest-dom matchers
    ├── types.ts                 # all shared types + phaseForAnte
    ├── types.test.ts
    ├── data/
    │   ├── jokers.json          # 150 jokers
    │   ├── vouchers.json        # 32 vouchers
    │   ├── consumables.json     # 22 tarot + 12 planet + 18 spectral
    │   ├── packs.json           # 15 booster pack variants
    │   ├── meta.json            # deck & stake names
    │   └── data.test.ts         # catalog validation
    ├── catalog/
    │   ├── catalog.ts           # typed access + id lookups
    │   ├── catalog.test.ts
    │   ├── search.ts            # fuzzy autocomplete search
    │   └── search.test.ts
    ├── run/
    │   ├── runStore.ts          # pure reducer, undo, persistence
    │   ├── runStore.test.ts
    │   └── RunContext.tsx       # React provider around the reducer
    ├── engine/
    │   ├── economy.ts           # interest math, sell values
    │   ├── economy.test.ts
    │   ├── archetype.ts         # build detection from joker tags
    │   ├── archetype.test.ts
    │   ├── recommend.ts         # shop + pack-pick recommendations
    │   └── recommend.test.ts
    └── ui/
        ├── components/
        │   ├── AutocompleteInput.tsx
        │   ├── NumberField.tsx
        │   └── RecommendationList.tsx
        └── screens/
            ├── RunSetup.tsx
            ├── RunOverview.tsx
            ├── RunOverview.test.tsx
            ├── ShopScreen.tsx
            ├── ShopScreen.test.tsx
            ├── PackScreen.tsx
            ├── PackScreen.test.tsx
            └── HistoryScreen.tsx
```

Design rule: `engine/` and `run/runStore.ts` never import React or touch the DOM. UI never computes scores itself.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/test-setup.ts`

- [ ] **Step 1: Write the config files**

`package.json`:

```json
{
  "name": "bal-track",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "icons": "node scripts/gen-icons.mjs",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/dom": "^10.4.0",
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.3",
    "vite": "^5.4.0",
    "vite-plugin-pwa": "^0.20.0",
    "vitest": "^2.0.5"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
});
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#1a1423" />
    <link rel="apple-touch-icon" href="/pwa-192.png" />
    <title>Bal-Track</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:

```
node_modules/
dist/
dev-dist/
*.local
```

- [ ] **Step 2: Write the entry files**

`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx` (placeholder, fully replaced in Task 12):

```tsx
export default function App() {
  return <h1>Bal-Track</h1>;
}
```

`src/styles.css` (placeholder, fully replaced in Task 18):

```css
body {
  margin: 0;
  background: #14101b;
  color: #ece6f2;
  font-family: system-ui, -apple-system, sans-serif;
}
```

`src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Install and verify toolchain**

Run: `npm install`
Expected: completes without errors (warnings are fine).

Run: `npm test`
Expected: exits 0 with "No test files found" (the `--passWithNoTests` flag makes this pass).

Run: `npm run build`
Expected: `tsc` passes, Vite writes a `dist/` directory.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS + Vitest project"
```

---

### Task 2: Shared types and phase helper

**Files:**
- Create: `src/types.ts`
- Test: `src/types.test.ts`

- [ ] **Step 1: Write the failing test**

`src/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HAND_TYPES, SYNERGY_TAGS, phaseForAnte } from './types';

describe('phaseForAnte', () => {
  it('maps antes to game phases', () => {
    expect(phaseForAnte(1)).toBe('early');
    expect(phaseForAnte(2)).toBe('early');
    expect(phaseForAnte(3)).toBe('mid');
    expect(phaseForAnte(5)).toBe('mid');
    expect(phaseForAnte(6)).toBe('late');
    expect(phaseForAnte(8)).toBe('late');
  });
});

describe('constants', () => {
  it('lists all 12 poker hands', () => {
    expect(HAND_TYPES).toHaveLength(12);
  });
  it('defines the synergy tag vocabulary', () => {
    expect(SYNERGY_TAGS).toContain('xmult');
    expect(SYNERGY_TAGS).toContain('flush-support');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/types.test.ts`
Expected: FAIL — cannot resolve `./types`.

- [ ] **Step 3: Write the implementation**

`src/types.ts`:

```ts
export type Phase = 'early' | 'mid' | 'late';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type Edition = 'base' | 'foil' | 'holographic' | 'polychrome' | 'negative';
export type ConsumableKind = 'tarot' | 'planet' | 'spectral';
export type PackKind = 'standard' | 'arcana' | 'celestial' | 'buffoon' | 'spectral';

export const HAND_TYPES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush',
  'Full House', 'Four of a Kind', 'Straight Flush', 'Five of a Kind',
  'Flush House', 'Flush Five',
] as const;
export type HandType = (typeof HAND_TYPES)[number];

export const SYNERGY_TAGS = [
  'xmult', 'plus-mult', 'chips', 'economy', 'retrigger', 'scaling',
  'flush-support', 'straight-support', 'pair-support', 'face-cards',
  'suit-hearts', 'suit-diamonds', 'suit-spades', 'suit-clubs',
  'hand-size', 'consumable', 'utility', 'high-risk',
] as const;
export type SynergyTag = (typeof SYNERGY_TAGS)[number];

export interface JokerDef {
  id: string;
  name: string;
  cost: number;
  rarity: Rarity;
  effect: string;
  rating: Record<Phase, number>; // 0..10 per phase
  tags: SynergyTag[];
}

export interface VoucherDef {
  id: string;
  name: string;
  cost: number;
  effect: string;
  rating: number; // 0..10
  requires?: string; // id of the base voucher for upgrade vouchers
}

export interface ConsumableDef {
  id: string;
  name: string;
  kind: ConsumableKind;
  cost: number; // usual shop price
  effect: string;
  rating: number; // 0..10
  hand?: HandType; // planets only
}

export interface PackDef {
  id: string;
  name: string;
  kind: PackKind;
  size: 'normal' | 'jumbo' | 'mega';
  cost: number;
  options: number; // cards shown
  picks: number; // cards you may take
  rating: Record<Phase, number>;
}

export interface OwnedJoker {
  jokerId: string;
  edition: Edition;
}

export interface RunState {
  deck: string;
  stake: string;
  ante: number;
  money: number;
  jokerSlots: number;
  consumableSlots: number;
  jokers: OwnedJoker[];
  vouchers: string[]; // voucher ids redeemed this run
  consumables: string[]; // consumable ids currently held
  handLevels: Record<HandType, number>; // all start at 1
  status: 'active' | 'won' | 'lost';
}

export type ShopCardSlot =
  | { kind: 'joker'; jokerId: string; edition: Edition; price: number }
  | { kind: 'consumable'; consumableId: string; price: number };

export interface ShopState {
  cards: ShopCardSlot[];
  voucherId: string | null;
  packIds: string[];
  rerollCost: number;
}

export type RecKind =
  | 'buy-joker' | 'buy-consumable' | 'buy-voucher' | 'buy-pack'
  | 'sell-and-buy' | 'reroll' | 'skip' | 'pick';

export interface Recommendation {
  kind: RecKind;
  action: string; // human-readable, e.g. "Buy Blueprint ($10)"
  score: number;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  refId?: string; // catalog id this refers to, if any
}

export function phaseForAnte(ante: number): Phase {
  return ante <= 2 ? 'early' : ante <= 5 ? 'mid' : 'late';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/types.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/types.test.ts
git commit -m "feat: shared domain types and ante phase helper"
```

---

### Task 3: Catalog data — vouchers, consumables, packs, meta

**Files:**
- Create: `src/data/vouchers.json`, `src/data/consumables.json`, `src/data/packs.json`, `src/data/meta.json`
- Test: `src/data/data.test.ts`

The JSON below is complete and final — copy it verbatim. Ratings are 0–10 heuristic values already curated for the engine.

- [ ] **Step 1: Write the failing validation test**

`src/data/data.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import vouchers from './vouchers.json';
import consumables from './consumables.json';
import packs from './packs.json';
import meta from './meta.json';

describe('vouchers.json', () => {
  it('contains all 32 vouchers with unique ids', () => {
    expect(vouchers).toHaveLength(32);
    expect(new Set(vouchers.map(v => v.id)).size).toBe(32);
  });
  it('has 16 upgrade vouchers whose requirements exist', () => {
    const ids = new Set(vouchers.map(v => v.id));
    const upgrades = vouchers.filter(v => 'requires' in v && v.requires);
    expect(upgrades).toHaveLength(16);
    for (const u of upgrades) expect(ids.has(u.requires as string)).toBe(true);
  });
});

describe('consumables.json', () => {
  it('contains 22 tarot, 12 planet, 18 spectral cards', () => {
    expect(consumables.filter(c => c.kind === 'tarot')).toHaveLength(22);
    expect(consumables.filter(c => c.kind === 'planet')).toHaveLength(12);
    expect(consumables.filter(c => c.kind === 'spectral')).toHaveLength(18);
  });
  it('gives every planet a poker hand', () => {
    for (const p of consumables.filter(c => c.kind === 'planet')) {
      expect(p.hand, p.id).toBeTruthy();
    }
  });
});

describe('packs.json', () => {
  it('contains 15 pack variants (5 kinds x 3 sizes)', () => {
    expect(packs).toHaveLength(15);
    for (const kind of ['standard', 'arcana', 'celestial', 'buffoon', 'spectral']) {
      expect(packs.filter(p => p.kind === kind)).toHaveLength(3);
    }
  });
});

describe('meta.json', () => {
  it('lists 15 decks and 8 stakes', () => {
    expect(meta.decks).toHaveLength(15);
    expect(meta.stakes).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/data/data.test.ts`
Expected: FAIL — the JSON files do not exist yet.

- [ ] **Step 3: Write the data files**

`src/data/vouchers.json`:

```json
[
  { "id": "overstock", "name": "Overstock", "cost": 10, "effect": "+1 card slot in the shop", "rating": 6 },
  { "id": "overstock-plus", "name": "Overstock Plus", "cost": 10, "effect": "+1 more card slot in the shop", "rating": 6, "requires": "overstock" },
  { "id": "clearance-sale", "name": "Clearance Sale", "cost": 10, "effect": "All cards and packs in shop are 25% off", "rating": 7 },
  { "id": "liquidation", "name": "Liquidation", "cost": 10, "effect": "All cards and packs in shop are 50% off", "rating": 8, "requires": "clearance-sale" },
  { "id": "hone", "name": "Hone", "cost": 10, "effect": "Foil, Holographic and Polychrome cards appear 2x more often", "rating": 5 },
  { "id": "glow-up", "name": "Glow Up", "cost": 10, "effect": "Foil, Holographic and Polychrome cards appear 4x more often", "rating": 6, "requires": "hone" },
  { "id": "reroll-surplus", "name": "Reroll Surplus", "cost": 10, "effect": "Rerolls cost $2 less", "rating": 6 },
  { "id": "reroll-glut", "name": "Reroll Glut", "cost": 10, "effect": "Rerolls cost an additional $2 less", "rating": 6, "requires": "reroll-surplus" },
  { "id": "crystal-ball", "name": "Crystal Ball", "cost": 10, "effect": "+1 consumable slot", "rating": 4 },
  { "id": "omen-globe", "name": "Omen Globe", "cost": 10, "effect": "Spectral cards may appear in any Arcana Pack", "rating": 5, "requires": "crystal-ball" },
  { "id": "telescope", "name": "Telescope", "cost": 10, "effect": "Celestial Packs always contain the Planet card for your most played poker hand", "rating": 7 },
  { "id": "observatory", "name": "Observatory", "cost": 10, "effect": "Planet cards in your consumable area give x1.5 Mult for their poker hand", "rating": 8, "requires": "telescope" },
  { "id": "grabber", "name": "Grabber", "cost": 10, "effect": "Permanently gain +1 hand per round", "rating": 5 },
  { "id": "nacho-tong", "name": "Nacho Tong", "cost": 10, "effect": "Permanently gain another +1 hand per round", "rating": 5, "requires": "grabber" },
  { "id": "wasteful", "name": "Wasteful", "cost": 10, "effect": "Permanently gain +1 discard per round", "rating": 4 },
  { "id": "recyclomancy", "name": "Recyclomancy", "cost": 10, "effect": "Permanently gain another +1 discard per round", "rating": 4, "requires": "wasteful" },
  { "id": "tarot-merchant", "name": "Tarot Merchant", "cost": 10, "effect": "Tarot cards appear 2x more frequently in the shop", "rating": 5 },
  { "id": "tarot-tycoon", "name": "Tarot Tycoon", "cost": 10, "effect": "Tarot cards appear 4x more frequently in the shop", "rating": 5, "requires": "tarot-merchant" },
  { "id": "planet-merchant", "name": "Planet Merchant", "cost": 10, "effect": "Planet cards appear 2x more frequently in the shop", "rating": 6 },
  { "id": "planet-tycoon", "name": "Planet Tycoon", "cost": 10, "effect": "Planet cards appear 4x more frequently in the shop", "rating": 6, "requires": "planet-merchant" },
  { "id": "seed-money", "name": "Seed Money", "cost": 10, "effect": "Raise the cap on interest earned per round to $10", "rating": 6 },
  { "id": "money-tree", "name": "Money Tree", "cost": 10, "effect": "Raise the cap on interest earned per round to $20", "rating": 5, "requires": "seed-money" },
  { "id": "blank", "name": "Blank", "cost": 10, "effect": "Does nothing?", "rating": 1 },
  { "id": "antimatter", "name": "Antimatter", "cost": 10, "effect": "+1 Joker slot", "rating": 9, "requires": "blank" },
  { "id": "magic-trick", "name": "Magic Trick", "cost": 10, "effect": "Playing cards can be purchased from the shop", "rating": 2 },
  { "id": "illusion", "name": "Illusion", "cost": 10, "effect": "Playing cards in shop may have an enhancement, edition, or seal", "rating": 4, "requires": "magic-trick" },
  { "id": "hieroglyph", "name": "Hieroglyph", "cost": 10, "effect": "-1 Ante, -1 hand per round", "rating": 5 },
  { "id": "petroglyph", "name": "Petroglyph", "cost": 10, "effect": "-1 Ante, -1 discard per round", "rating": 4, "requires": "hieroglyph" },
  { "id": "directors-cut", "name": "Director's Cut", "cost": 10, "effect": "Reroll Boss Blind once per Ante, $10 per roll", "rating": 5 },
  { "id": "retcon", "name": "Retcon", "cost": 10, "effect": "Reroll Boss Blind unlimited times, $10 per roll", "rating": 6, "requires": "directors-cut" },
  { "id": "paint-brush", "name": "Paint Brush", "cost": 10, "effect": "+1 hand size", "rating": 4 },
  { "id": "palette", "name": "Palette", "cost": 10, "effect": "+1 more hand size", "rating": 6, "requires": "paint-brush" }
]
```

`src/data/consumables.json`:

```json
[
  { "id": "the-fool", "name": "The Fool", "kind": "tarot", "cost": 3, "effect": "Creates a copy of the last Tarot or Planet card used", "rating": 5 },
  { "id": "the-magician", "name": "The Magician", "kind": "tarot", "cost": 3, "effect": "Enhances 2 selected cards to Lucky Cards", "rating": 3 },
  { "id": "the-high-priestess", "name": "The High Priestess", "kind": "tarot", "cost": 3, "effect": "Creates up to 2 random Planet cards", "rating": 5 },
  { "id": "the-empress", "name": "The Empress", "kind": "tarot", "cost": 3, "effect": "Enhances 2 selected cards to Mult Cards", "rating": 4 },
  { "id": "the-emperor", "name": "The Emperor", "kind": "tarot", "cost": 3, "effect": "Creates up to 2 random Tarot cards", "rating": 5 },
  { "id": "the-hierophant", "name": "The Hierophant", "kind": "tarot", "cost": 3, "effect": "Enhances 2 selected cards to Bonus Cards", "rating": 3 },
  { "id": "the-lovers", "name": "The Lovers", "kind": "tarot", "cost": 3, "effect": "Enhances 1 selected card into a Wild Card", "rating": 4 },
  { "id": "the-chariot", "name": "The Chariot", "kind": "tarot", "cost": 3, "effect": "Enhances 1 selected card into a Steel Card", "rating": 5 },
  { "id": "justice", "name": "Justice", "kind": "tarot", "cost": 3, "effect": "Enhances 1 selected card into a Glass Card", "rating": 4 },
  { "id": "the-hermit", "name": "The Hermit", "kind": "tarot", "cost": 3, "effect": "Doubles money (max of $20)", "rating": 7 },
  { "id": "the-wheel-of-fortune", "name": "The Wheel of Fortune", "kind": "tarot", "cost": 3, "effect": "1 in 4 chance to add Foil, Holographic, or Polychrome edition to a random Joker", "rating": 4 },
  { "id": "strength", "name": "Strength", "kind": "tarot", "cost": 3, "effect": "Increases rank of up to 2 selected cards by 1", "rating": 3 },
  { "id": "the-hanged-man", "name": "The Hanged Man", "kind": "tarot", "cost": 3, "effect": "Destroys up to 2 selected cards", "rating": 5 },
  { "id": "death", "name": "Death", "kind": "tarot", "cost": 3, "effect": "Converts the left selected card into the right one", "rating": 5 },
  { "id": "temperance", "name": "Temperance", "kind": "tarot", "cost": 3, "effect": "Gives the total sell value of all current Jokers (max of $50)", "rating": 5 },
  { "id": "the-devil", "name": "The Devil", "kind": "tarot", "cost": 3, "effect": "Enhances 1 selected card into a Gold Card", "rating": 4 },
  { "id": "the-tower", "name": "The Tower", "kind": "tarot", "cost": 3, "effect": "Enhances 1 selected card into a Stone Card", "rating": 3 },
  { "id": "the-star", "name": "The Star", "kind": "tarot", "cost": 3, "effect": "Converts up to 3 selected cards to Diamonds", "rating": 4 },
  { "id": "the-moon", "name": "The Moon", "kind": "tarot", "cost": 3, "effect": "Converts up to 3 selected cards to Clubs", "rating": 4 },
  { "id": "the-sun", "name": "The Sun", "kind": "tarot", "cost": 3, "effect": "Converts up to 3 selected cards to Hearts", "rating": 4 },
  { "id": "judgement", "name": "Judgement", "kind": "tarot", "cost": 3, "effect": "Creates a random Joker", "rating": 5 },
  { "id": "the-world", "name": "The World", "kind": "tarot", "cost": 3, "effect": "Converts up to 3 selected cards to Spades", "rating": 4 },
  { "id": "pluto", "name": "Pluto", "kind": "planet", "cost": 3, "effect": "+1 level to High Card", "rating": 3, "hand": "High Card" },
  { "id": "mercury", "name": "Mercury", "kind": "planet", "cost": 3, "effect": "+1 level to Pair", "rating": 5, "hand": "Pair" },
  { "id": "uranus", "name": "Uranus", "kind": "planet", "cost": 3, "effect": "+1 level to Two Pair", "rating": 4, "hand": "Two Pair" },
  { "id": "venus", "name": "Venus", "kind": "planet", "cost": 3, "effect": "+1 level to Three of a Kind", "rating": 5, "hand": "Three of a Kind" },
  { "id": "saturn", "name": "Saturn", "kind": "planet", "cost": 3, "effect": "+1 level to Straight", "rating": 6, "hand": "Straight" },
  { "id": "jupiter", "name": "Jupiter", "kind": "planet", "cost": 3, "effect": "+1 level to Flush", "rating": 6, "hand": "Flush" },
  { "id": "earth", "name": "Earth", "kind": "planet", "cost": 3, "effect": "+1 level to Full House", "rating": 4, "hand": "Full House" },
  { "id": "mars", "name": "Mars", "kind": "planet", "cost": 3, "effect": "+1 level to Four of a Kind", "rating": 5, "hand": "Four of a Kind" },
  { "id": "neptune", "name": "Neptune", "kind": "planet", "cost": 3, "effect": "+1 level to Straight Flush", "rating": 5, "hand": "Straight Flush" },
  { "id": "planet-x", "name": "Planet X", "kind": "planet", "cost": 3, "effect": "+1 level to Five of a Kind", "rating": 4, "hand": "Five of a Kind" },
  { "id": "ceres", "name": "Ceres", "kind": "planet", "cost": 3, "effect": "+1 level to Flush House", "rating": 4, "hand": "Flush House" },
  { "id": "eris", "name": "Eris", "kind": "planet", "cost": 3, "effect": "+1 level to Flush Five", "rating": 4, "hand": "Flush Five" },
  { "id": "familiar", "name": "Familiar", "kind": "spectral", "cost": 4, "effect": "Destroy 1 random card in hand, add 3 random enhanced face cards", "rating": 4 },
  { "id": "grim", "name": "Grim", "kind": "spectral", "cost": 4, "effect": "Destroy 1 random card in hand, add 2 random enhanced Aces", "rating": 4 },
  { "id": "incantation", "name": "Incantation", "kind": "spectral", "cost": 4, "effect": "Destroy 1 random card in hand, add 4 random enhanced numbered cards", "rating": 4 },
  { "id": "talisman", "name": "Talisman", "kind": "spectral", "cost": 4, "effect": "Add a Gold Seal to 1 selected card", "rating": 3 },
  { "id": "aura", "name": "Aura", "kind": "spectral", "cost": 4, "effect": "Add Foil, Holographic, or Polychrome to 1 selected card in hand", "rating": 5 },
  { "id": "wraith", "name": "Wraith", "kind": "spectral", "cost": 4, "effect": "Creates a random Rare Joker, sets money to $0", "rating": 3 },
  { "id": "sigil", "name": "Sigil", "kind": "spectral", "cost": 4, "effect": "Converts all cards in hand to a single random suit", "rating": 2 },
  { "id": "ouija", "name": "Ouija", "kind": "spectral", "cost": 4, "effect": "Converts all cards in hand to a single random rank, -1 hand size", "rating": 3 },
  { "id": "ectoplasm", "name": "Ectoplasm", "kind": "spectral", "cost": 4, "effect": "Add Negative to a random Joker, -1 hand size", "rating": 5 },
  { "id": "immolate", "name": "Immolate", "kind": "spectral", "cost": 4, "effect": "Destroys 5 random cards in hand, gain $20", "rating": 5 },
  { "id": "ankh", "name": "Ankh", "kind": "spectral", "cost": 4, "effect": "Creates a copy of a random Joker, destroys all other Jokers", "rating": 5 },
  { "id": "deja-vu", "name": "Deja Vu", "kind": "spectral", "cost": 4, "effect": "Add a Red Seal to 1 selected card", "rating": 4 },
  { "id": "hex", "name": "Hex", "kind": "spectral", "cost": 4, "effect": "Add Polychrome to a random Joker, destroys all other Jokers", "rating": 5 },
  { "id": "trance", "name": "Trance", "kind": "spectral", "cost": 4, "effect": "Add a Blue Seal to 1 selected card", "rating": 4 },
  { "id": "medium", "name": "Medium", "kind": "spectral", "cost": 4, "effect": "Add a Purple Seal to 1 selected card", "rating": 4 },
  { "id": "cryptid", "name": "Cryptid", "kind": "spectral", "cost": 4, "effect": "Creates 2 exact copies of 1 selected card", "rating": 4 },
  { "id": "the-soul", "name": "The Soul", "kind": "spectral", "cost": 4, "effect": "Creates a Legendary Joker", "rating": 10 },
  { "id": "black-hole", "name": "Black Hole", "kind": "spectral", "cost": 4, "effect": "+1 level to every poker hand", "rating": 9 }
]
```

`src/data/packs.json`:

```json
[
  { "id": "standard-normal", "name": "Standard Pack", "kind": "standard", "size": "normal", "cost": 4, "options": 3, "picks": 1, "rating": { "early": 3, "mid": 3, "late": 2 } },
  { "id": "standard-jumbo", "name": "Jumbo Standard Pack", "kind": "standard", "size": "jumbo", "cost": 6, "options": 5, "picks": 1, "rating": { "early": 3.5, "mid": 3.5, "late": 2.5 } },
  { "id": "standard-mega", "name": "Mega Standard Pack", "kind": "standard", "size": "mega", "cost": 8, "options": 5, "picks": 2, "rating": { "early": 4, "mid": 4, "late": 3 } },
  { "id": "arcana-normal", "name": "Arcana Pack", "kind": "arcana", "size": "normal", "cost": 4, "options": 3, "picks": 1, "rating": { "early": 5, "mid": 5, "late": 4 } },
  { "id": "arcana-jumbo", "name": "Jumbo Arcana Pack", "kind": "arcana", "size": "jumbo", "cost": 6, "options": 5, "picks": 1, "rating": { "early": 5.5, "mid": 5.5, "late": 4.5 } },
  { "id": "arcana-mega", "name": "Mega Arcana Pack", "kind": "arcana", "size": "mega", "cost": 8, "options": 5, "picks": 2, "rating": { "early": 6, "mid": 6, "late": 5 } },
  { "id": "celestial-normal", "name": "Celestial Pack", "kind": "celestial", "size": "normal", "cost": 4, "options": 3, "picks": 1, "rating": { "early": 7, "mid": 6, "late": 4 } },
  { "id": "celestial-jumbo", "name": "Jumbo Celestial Pack", "kind": "celestial", "size": "jumbo", "cost": 6, "options": 5, "picks": 1, "rating": { "early": 7.5, "mid": 6.5, "late": 4.5 } },
  { "id": "celestial-mega", "name": "Mega Celestial Pack", "kind": "celestial", "size": "mega", "cost": 8, "options": 5, "picks": 2, "rating": { "early": 8, "mid": 7, "late": 5 } },
  { "id": "buffoon-normal", "name": "Buffoon Pack", "kind": "buffoon", "size": "normal", "cost": 4, "options": 2, "picks": 1, "rating": { "early": 6, "mid": 5, "late": 4 } },
  { "id": "buffoon-jumbo", "name": "Jumbo Buffoon Pack", "kind": "buffoon", "size": "jumbo", "cost": 6, "options": 4, "picks": 1, "rating": { "early": 6.5, "mid": 5.5, "late": 4.5 } },
  { "id": "buffoon-mega", "name": "Mega Buffoon Pack", "kind": "buffoon", "size": "mega", "cost": 8, "options": 4, "picks": 2, "rating": { "early": 7, "mid": 6, "late": 5 } },
  { "id": "spectral-normal", "name": "Spectral Pack", "kind": "spectral", "size": "normal", "cost": 4, "options": 2, "picks": 1, "rating": { "early": 6, "mid": 6, "late": 5 } },
  { "id": "spectral-jumbo", "name": "Jumbo Spectral Pack", "kind": "spectral", "size": "jumbo", "cost": 6, "options": 4, "picks": 1, "rating": { "early": 6.5, "mid": 6.5, "late": 5.5 } },
  { "id": "spectral-mega", "name": "Mega Spectral Pack", "kind": "spectral", "size": "mega", "cost": 8, "options": 4, "picks": 2, "rating": { "early": 7, "mid": 7, "late": 6 } }
]
```

`src/data/meta.json`:

```json
{
  "decks": ["Red", "Blue", "Yellow", "Green", "Black", "Magic", "Nebula", "Ghost", "Abandoned", "Checkered", "Zodiac", "Painted", "Anaglyph", "Plasma", "Erratic"],
  "stakes": ["White", "Red", "Green", "Black", "Blue", "Purple", "Orange", "Gold"]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/data/data.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/
git commit -m "feat: catalog data for vouchers, consumables, packs, decks, stakes"
```

---

### Task 4: Catalog data — all 150 jokers

**Files:**
- Create: `src/data/jokers.json`
- Test: `src/data/jokers.test.ts`

This is the one content-heavy task. The schema, 11 pinned entries (which later tests depend on — copy them EXACTLY), the rating rubric, and the tagging guide are below. The remaining 139 entries are transcribed from `https://balatrogame.fandom.com/wiki/Jokers` (fetch with WebFetch; the page has a complete table of name / cost / rarity / effect). Names, ids (kebab-case of the name), costs, rarities and effect texts come from the wiki; ratings and tags are assigned by you using the rubric.

- [ ] **Step 1: Write the failing validation test**

`src/data/jokers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import jokers from './jokers.json';
import { SYNERGY_TAGS } from '../types';

describe('jokers.json', () => {
  it('contains all 150 jokers with unique ids', () => {
    expect(jokers).toHaveLength(150);
    expect(new Set(jokers.map(j => j.id)).size).toBe(150);
  });

  it('matches the rarity distribution of the game', () => {
    expect(jokers.filter(j => j.rarity === 'common')).toHaveLength(61);
    expect(jokers.filter(j => j.rarity === 'uncommon')).toHaveLength(64);
    expect(jokers.filter(j => j.rarity === 'rare')).toHaveLength(20);
    expect(jokers.filter(j => j.rarity === 'legendary')).toHaveLength(5);
  });

  it('has valid fields on every joker', () => {
    const tagSet = new Set<string>(SYNERGY_TAGS);
    for (const j of jokers) {
      expect(j.name, j.id).toBeTruthy();
      expect(j.effect, j.id).toBeTruthy();
      expect(j.cost, j.id).toBeGreaterThanOrEqual(1);
      expect(j.cost, j.id).toBeLessThanOrEqual(20);
      expect(j.tags.length, j.id).toBeGreaterThanOrEqual(1);
      for (const t of j.tags) expect(tagSet.has(t), `${j.id}: ${t}`).toBe(true);
      for (const phase of ['early', 'mid', 'late'] as const) {
        expect(j.rating[phase], j.id).toBeGreaterThanOrEqual(0);
        expect(j.rating[phase], j.id).toBeLessThanOrEqual(10);
      }
    }
  });

  it('contains the pinned entries the engine tests rely on', () => {
    const byId = new Map(jokers.map(j => [j.id, j]));
    expect(byId.get('blueprint')?.rating.mid).toBe(9);
    expect(byId.get('joker')?.rating.early).toBe(3);
    expect(byId.get('golden-joker')?.cost).toBe(6);
    expect(byId.get('droll-joker')?.tags).toContain('flush-support');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/data/jokers.test.ts`
Expected: FAIL — `jokers.json` does not exist.

- [ ] **Step 3: Create `src/data/jokers.json` starting with the 11 pinned entries**

These exact objects MUST appear in the final file (later tests depend on their values):

```json
[
  { "id": "joker", "name": "Joker", "cost": 2, "rarity": "common", "effect": "+4 Mult", "rating": { "early": 3, "mid": 2, "late": 1 }, "tags": ["plus-mult"] },
  { "id": "greedy-joker", "name": "Greedy Joker", "cost": 5, "rarity": "common", "effect": "Played cards with Diamond suit give +3 Mult when scored", "rating": { "early": 4, "mid": 3, "late": 2 }, "tags": ["plus-mult", "suit-diamonds"] },
  { "id": "droll-joker", "name": "Droll Joker", "cost": 4, "rarity": "common", "effect": "+10 Mult if played hand contains a Flush", "rating": { "early": 5, "mid": 4, "late": 2 }, "tags": ["plus-mult", "flush-support"] },
  { "id": "crafty-joker", "name": "Crafty Joker", "cost": 4, "rarity": "common", "effect": "+80 Chips if played hand contains a Flush", "rating": { "early": 5, "mid": 4, "late": 2 }, "tags": ["chips", "flush-support"] },
  { "id": "golden-joker", "name": "Golden Joker", "cost": 6, "rarity": "common", "effect": "Earn $4 at end of round", "rating": { "early": 6, "mid": 5, "late": 2 }, "tags": ["economy"] },
  { "id": "cavendish", "name": "Cavendish", "cost": 4, "rarity": "common", "effect": "X3 Mult, 1 in 1000 chance this card is destroyed at the end of round", "rating": { "early": 6, "mid": 6, "late": 5 }, "tags": ["xmult", "high-risk"] },
  { "id": "photograph", "name": "Photograph", "cost": 5, "rarity": "common", "effect": "First played face card gives X2 Mult when scored", "rating": { "early": 6, "mid": 5, "late": 4 }, "tags": ["xmult", "face-cards"] },
  { "id": "constellation", "name": "Constellation", "cost": 6, "rarity": "uncommon", "effect": "This Joker gains X0.1 Mult every time a Planet card is used", "rating": { "early": 6, "mid": 7, "late": 6 }, "tags": ["xmult", "scaling"] },
  { "id": "baron", "name": "Baron", "cost": 8, "rarity": "rare", "effect": "Each King held in hand gives X1.5 Mult", "rating": { "early": 5, "mid": 8, "late": 9 }, "tags": ["xmult", "face-cards"] },
  { "id": "blueprint", "name": "Blueprint", "cost": 10, "rarity": "rare", "effect": "Copies ability of Joker to the right", "rating": { "early": 7, "mid": 9, "late": 10 }, "tags": ["utility"] },
  { "id": "triboulet", "name": "Triboulet", "cost": 20, "rarity": "legendary", "effect": "Played Kings and Queens each give X2 Mult when scored", "rating": { "early": 9, "mid": 10, "late": 10 }, "tags": ["xmult", "face-cards"] }
]
```

Run: `npm test -- src/data/jokers.test.ts`
Expected: FAIL — length is 11, not 150. This confirms the test bites.

- [ ] **Step 4: Complete the file to all 150 jokers**

Fetch `https://balatrogame.fandom.com/wiki/Jokers` with WebFetch and transcribe every remaining joker. Rules:

- `id` = kebab-case of the English name (`"8 Ball"` → `"8-ball"`, `"Mr. Bones"` → `"mr-bones"`, `"Oops! All 6s"` → `"oops-all-6s"`, `"Séance"` → `"seance"`, `"Riff-Raff"` → `"riff-raff"`).
- `cost`, `rarity`, `effect` verbatim from the wiki (shorten effect text where very long, keep the mechanic recognizable).
- Legendary jokers (exactly these 5: Canio, Triboulet, Yorick, Chicot, Perkeo) get `cost: 20`; they never appear in shops (the catalog module handles that).

**Rating rubric** (0–10 per phase; pick within the band using your judgment of community consensus):

| Effect pattern | early | mid | late |
|---|---|---|---|
| Flat +Mult / +Chips (Joker, Jolly Joker, …) | 3–5 | 2–4 | 1–2 |
| Conditional +Mult/+Chips (per suit / per hand type) | 4–6 | 3–5 | 2–3 |
| Flat xMult (Cavendish, Photograph, …) | 5–7 | 5–7 | 4–6 |
| Scaling effects that grow over the run (Ride the Bus, Constellation, Hologram, Green Joker, …) | 5–7 | 7–8 | 6–8 |
| Held-in-hand / build-around xMult (Baron, Steel Joker, …) | 4–6 | 7–9 | 8–10 |
| Economy (Golden Joker, Rocket, Bull, Cloud 9, …) | 6–7 | 4–6 | 1–3 |
| Retrigger (Dusk, Hack, Sock and Buskin, …) | 5–6 | 6–8 | 6–8 |
| Utility / copy / slot effects (Blueprint, Brainstorm, Showman, …) | 6–8 | 8–10 | 8–10 |
| Chance-based or self-destructing (Gros Michel, Business Card, …) | 3–5 | 2–4 | 1–3 |
| Legendary | 8–10 | 9–10 | 9–10 |

**Tagging guide** (1–3 tags per joker, only from `SYNERGY_TAGS`):
`xmult` any X-Mult effect · `plus-mult` additive Mult · `chips` chip bonuses · `economy` generates money · `retrigger` retriggers cards · `scaling` grows permanently · `flush-support`/`straight-support`/`pair-support` rewards or enables that hand family (Four Fingers gets both flush and straight) · `face-cards` cares about J/Q/K · `suit-hearts`/`suit-diamonds`/`suit-spades`/`suit-clubs` · `hand-size` changes hand size · `consumable` creates or benefits from consumables · `utility` meta effects (copying, slots, sell value) · `high-risk` can self-destruct or cost resources.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/data/jokers.test.ts`
Expected: PASS (4 tests). If the rarity distribution assertion fails, recount against the wiki — the game has 61 common, 64 uncommon, 20 rare, 5 legendary.

- [ ] **Step 6: Commit**

```bash
git add src/data/jokers.json src/data/jokers.test.ts
git commit -m "feat: full joker catalog with ratings and synergy tags"
```

---

### Task 5: Catalog module

**Files:**
- Create: `src/catalog/catalog.ts`
- Test: `src/catalog/catalog.test.ts`

- [ ] **Step 1: Write the failing test**

`src/catalog/catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getConsumable, getJoker, getPack, getVoucher, jokers, shopJokers } from './catalog';

describe('catalog lookups', () => {
  it('finds jokers by id', () => {
    expect(getJoker('blueprint')?.name).toBe('Blueprint');
    expect(getJoker('does-not-exist')).toBeUndefined();
  });
  it('finds vouchers, consumables and packs by id', () => {
    expect(getVoucher('antimatter')?.requires).toBe('blank');
    expect(getConsumable('jupiter')?.hand).toBe('Flush');
    expect(getPack('celestial-normal')?.cost).toBe(4);
  });
  it('excludes legendary jokers from the shop pool', () => {
    expect(shopJokers).toHaveLength(145);
    expect(shopJokers.some(j => j.rarity === 'legendary')).toBe(false);
    expect(jokers).toHaveLength(150);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/catalog/catalog.test.ts`
Expected: FAIL — cannot resolve `./catalog`.

- [ ] **Step 3: Write the implementation**

`src/catalog/catalog.ts`:

```ts
import jokersJson from '../data/jokers.json';
import vouchersJson from '../data/vouchers.json';
import consumablesJson from '../data/consumables.json';
import packsJson from '../data/packs.json';
import type { ConsumableDef, JokerDef, PackDef, VoucherDef } from '../types';

export const jokers = jokersJson as unknown as JokerDef[];
export const vouchers = vouchersJson as unknown as VoucherDef[];
export const consumables = consumablesJson as unknown as ConsumableDef[];
export const packs = packsJson as unknown as PackDef[];

export const shopJokers = jokers.filter(j => j.rarity !== 'legendary');

const jokerById = new Map(jokers.map(j => [j.id, j]));
const voucherById = new Map(vouchers.map(v => [v.id, v]));
const consumableById = new Map(consumables.map(c => [c.id, c]));
const packById = new Map(packs.map(p => [p.id, p]));

export function getJoker(id: string): JokerDef | undefined {
  return jokerById.get(id);
}
export function getVoucher(id: string): VoucherDef | undefined {
  return voucherById.get(id);
}
export function getConsumable(id: string): ConsumableDef | undefined {
  return consumableById.get(id);
}
export function getPack(id: string): PackDef | undefined {
  return packById.get(id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/catalog/catalog.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/catalog/
git commit -m "feat: typed catalog module with id lookups"
```

---

### Task 6: Autocomplete search

**Files:**
- Create: `src/catalog/search.ts`
- Test: `src/catalog/search.test.ts`

- [ ] **Step 1: Write the failing test**

`src/catalog/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { searchCatalog } from './search';

describe('searchCatalog', () => {
  it('matches by prefix and substring', () => {
    const names = searchCatalog('blue', ['joker']).map(r => r.name);
    expect(names).toContain('Blueprint');
    expect(names).toContain('Blue Joker');
  });

  it('tolerates a missing letter via subsequence matching', () => {
    const names = searchCatalog('bluprint', ['joker']).map(r => r.name);
    expect(names).toContain('Blueprint');
  });

  it('restricts results to the requested kinds', () => {
    const results = searchCatalog('ju', ['planet']);
    expect(results.map(r => r.name)).toContain('Jupiter');
    expect(results.every(r => r.kind === 'planet')).toBe(true);
  });

  it('excludes legendaries from shop-joker searches', () => {
    expect(searchCatalog('triboulet', ['shop-joker'])).toHaveLength(0);
    expect(searchCatalog('triboulet', ['joker'])).toHaveLength(1);
  });

  it('returns nothing for an empty query and caps results', () => {
    expect(searchCatalog('', ['joker'])).toHaveLength(0);
    expect(searchCatalog('a', ['joker']).length).toBeLessThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/catalog/search.test.ts`
Expected: FAIL — cannot resolve `./search`.

- [ ] **Step 3: Write the implementation**

`src/catalog/search.ts`:

```ts
import type { JokerDef } from '../types';
import { consumables, jokers, packs, shopJokers, vouchers } from './catalog';

export type SearchKind = 'joker' | 'shop-joker' | 'voucher' | 'tarot' | 'planet' | 'spectral' | 'pack';

export interface SearchItem {
  id: string;
  name: string;
  kind: SearchKind;
  sub: string; // subtitle shown under the name, e.g. "$6 · uncommon"
}

function jokerItem(j: JokerDef, kind: SearchKind): SearchItem {
  return { id: j.id, name: j.name, kind, sub: `$${j.cost} · ${j.rarity}` };
}

function itemsFor(kind: SearchKind): SearchItem[] {
  switch (kind) {
    case 'joker':
      return jokers.map(j => jokerItem(j, 'joker'));
    case 'shop-joker':
      return shopJokers.map(j => jokerItem(j, 'shop-joker'));
    case 'voucher':
      return vouchers.map(v => ({ id: v.id, name: v.name, kind: 'voucher' as const, sub: `$${v.cost} · voucher` }));
    case 'tarot':
    case 'planet':
    case 'spectral':
      return consumables
        .filter(c => c.kind === kind)
        .map(c => ({ id: c.id, name: c.name, kind, sub: `$${c.cost} · ${c.kind}` }));
    case 'pack':
      return packs.map(p => ({ id: p.id, name: p.name, kind: 'pack' as const, sub: `$${p.cost} · pack` }));
  }
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i++;
  }
  return i >= needle.length;
}

function matchScore(name: string, query: string): number {
  const n = name.toLowerCase();
  if (n.startsWith(query)) return 3;
  if (n.split(/[^a-z0-9]+/).some(w => w.startsWith(query))) return 2.5;
  if (n.includes(query)) return 2;
  if (query.length >= 3 && isSubsequence(query, n)) return 1;
  return 0;
}

export function searchCatalog(query: string, kinds: SearchKind[], limit = 8): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return kinds
    .flatMap(itemsFor)
    .map(item => ({ item, s: matchScore(item.name, q) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map(({ item }) => item);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/catalog/search.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/catalog/search.ts src/catalog/search.test.ts
git commit -m "feat: fuzzy catalog search for autocomplete"
```

---

### Task 7: Economy helpers

**Files:**
- Create: `src/engine/economy.ts`
- Test: `src/engine/economy.test.ts`

- [ ] **Step 1: Write the failing test**

`src/engine/economy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { interest, interestCapFor, interestLost, sellValue } from './economy';

describe('interest', () => {
  it('earns $1 per full $5, capped at $5 by default', () => {
    expect(interest(0)).toBe(0);
    expect(interest(4)).toBe(0);
    expect(interest(24)).toBe(4);
    expect(interest(25)).toBe(5);
    expect(interest(60)).toBe(5);
  });
  it('respects a raised cap', () => {
    expect(interest(60, 10)).toBe(10);
    expect(interest(60, 20)).toBe(12);
  });
});

describe('interestCapFor', () => {
  it('is raised by Seed Money and Money Tree', () => {
    expect(interestCapFor([])).toBe(5);
    expect(interestCapFor(['seed-money'])).toBe(10);
    expect(interestCapFor(['seed-money', 'money-tree'])).toBe(20);
  });
});

describe('interestLost', () => {
  it('is the interest difference caused by a purchase', () => {
    expect(interestLost(24, 6)).toBe(1);
    expect(interestLost(30, 5)).toBe(0);
    expect(interestLost(40, 10)).toBe(0);
    expect(interestLost(25, 20)).toBe(4);
  });
});

describe('sellValue', () => {
  it('is half the cost, floored, minimum $1', () => {
    expect(sellValue(6, 'base')).toBe(3);
    expect(sellValue(2, 'base')).toBe(1);
    expect(sellValue(1, 'base')).toBe(1);
  });
  it('editions raise the sell value', () => {
    expect(sellValue(10, 'polychrome')).toBe(7);
    expect(sellValue(10, 'foil')).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/economy.test.ts`
Expected: FAIL — cannot resolve `./economy`.

- [ ] **Step 3: Write the implementation**

`src/engine/economy.ts`:

```ts
import type { Edition } from '../types';

/** Interest cap in dollars earned per round (base game: $5 at $25 banked). */
export function interestCapFor(voucherIds: string[]): number {
  if (voucherIds.includes('money-tree')) return 20;
  if (voucherIds.includes('seed-money')) return 10;
  return 5;
}

export function interest(money: number, cap = 5): number {
  return Math.max(0, Math.min(cap, Math.floor(money / 5)));
}

export function interestLost(money: number, cost: number, cap = 5): number {
  return interest(money, cap) - interest(money - cost, cap);
}

export const EDITION_COST_BONUS: Record<Edition, number> = {
  base: 0,
  foil: 2,
  holographic: 3,
  polychrome: 5,
  negative: 5,
};

export function sellValue(cost: number, edition: Edition): number {
  return Math.max(1, Math.floor((cost + EDITION_COST_BONUS[edition]) / 2));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/engine/economy.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/
git commit -m "feat: interest and sell-value economy helpers"
```

---

### Task 8: Run store — pure reducer with undo and persistence

**Files:**
- Create: `src/run/runStore.ts`
- Test: `src/run/runStore.test.ts`

- [ ] **Step 1: Write the failing test**

`src/run/runStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY, initialStore, load, newRunState, reduce, save } from './runStore';
import type { StoreState } from './runStore';

function started(deck = 'Red', stake = 'White'): StoreState {
  return reduce(initialStore(), { type: 'START_RUN', deck, stake });
}

beforeEach(() => localStorage.clear());

describe('newRunState', () => {
  it('starts with $4, ante 1, 5 joker slots, all hands level 1', () => {
    const run = newRunState('Red', 'White');
    expect(run.money).toBe(4);
    expect(run.ante).toBe(1);
    expect(run.jokerSlots).toBe(5);
    expect(run.handLevels['Flush']).toBe(1);
    expect(run.status).toBe('active');
  });
  it('applies deck quirks', () => {
    expect(newRunState('Yellow', 'White').money).toBe(14);
    expect(newRunState('Black', 'White').jokerSlots).toBe(6);
    expect(newRunState('Painted', 'White').jokerSlots).toBe(4);
  });
});

describe('reduce', () => {
  it('buys a joker and deducts the price', () => {
    const s = reduce(started(), { type: 'ADD_JOKER', jokerId: 'joker', edition: 'base', price: 2 });
    expect(s.current?.jokers).toEqual([{ jokerId: 'joker', edition: 'base' }]);
    expect(s.current?.money).toBe(2);
  });

  it('adds a joker without price for manual corrections', () => {
    const s = reduce(started(), { type: 'ADD_JOKER', jokerId: 'baron', edition: 'foil' });
    expect(s.current?.money).toBe(4);
  });

  it('sells a joker and refunds the sell value', () => {
    let s = started();
    s = reduce(s, { type: 'ADD_JOKER', jokerId: 'golden-joker', edition: 'base' }); // cost 6 → sell 3
    s = reduce(s, { type: 'SELL_JOKER', index: 0 });
    expect(s.current?.jokers).toHaveLength(0);
    expect(s.current?.money).toBe(7);
  });

  it('redeems vouchers and applies their state effects', () => {
    let s = started();
    s = reduce(s, { type: 'SET_MONEY', money: 30 });
    s = reduce(s, { type: 'REDEEM_VOUCHER', voucherId: 'antimatter', price: 10 });
    expect(s.current?.money).toBe(20);
    expect(s.current?.jokerSlots).toBe(6);
    s = reduce(s, { type: 'REDEEM_VOUCHER', voucherId: 'crystal-ball' });
    expect(s.current?.consumableSlots).toBe(3);
  });

  it('uses a held planet card to raise its hand level', () => {
    let s = started();
    s = reduce(s, { type: 'ADD_CONSUMABLE', consumableId: 'jupiter' });
    s = reduce(s, { type: 'USE_CONSUMABLE', index: 0 });
    expect(s.current?.handLevels['Flush']).toBe(2);
    expect(s.current?.consumables).toHaveLength(0);
  });

  it('plays a planet directly from a pack', () => {
    const s = reduce(started(), { type: 'PLAY_PLANET', consumableId: 'mercury' });
    expect(s.current?.handLevels['Pair']).toBe(2);
  });

  it('undoes the last action', () => {
    let s = started();
    s = reduce(s, { type: 'SET_MONEY', money: 99 });
    s = reduce(s, { type: 'UNDO' });
    expect(s.current?.money).toBe(4);
  });

  it('ends a run into the history', () => {
    const s = reduce(started(), { type: 'END_RUN', result: 'lost' });
    expect(s.current).toBeNull();
    expect(s.finished[0]?.result).toBe('lost');
    expect(s.finished[0]?.deck).toBe('Red');
  });
});

describe('persistence', () => {
  it('round-trips through localStorage', () => {
    const s = started('Blue', 'Gold');
    save(s);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    expect(load()?.current?.deck).toBe('Blue');
  });
  it('returns null when nothing is stored', () => {
    expect(load()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/run/runStore.test.ts`
Expected: FAIL — cannot resolve `./runStore`.

- [ ] **Step 3: Write the implementation**

`src/run/runStore.ts`:

```ts
import { getConsumable, getJoker } from '../catalog/catalog';
import { sellValue } from '../engine/economy';
import { HAND_TYPES } from '../types';
import type { Edition, HandType, RunState } from '../types';

export interface FinishedRun {
  deck: string;
  stake: string;
  ante: number;
  result: 'won' | 'lost';
  endedAt: string; // ISO date
}

export interface StoreState {
  current: RunState | null;
  past: RunState[]; // undo snapshots, oldest first, max 50
  finished: FinishedRun[];
}

export type RunAction =
  | { type: 'START_RUN'; deck: string; stake: string }
  | { type: 'SET_MONEY'; money: number }
  | { type: 'SET_ANTE'; ante: number }
  | { type: 'SET_JOKER_SLOTS'; slots: number }
  | { type: 'ADD_JOKER'; jokerId: string; edition: Edition; price?: number }
  | { type: 'SET_JOKER_EDITION'; index: number; edition: Edition }
  | { type: 'SELL_JOKER'; index: number }
  | { type: 'REDEEM_VOUCHER'; voucherId: string; price?: number }
  | { type: 'ADD_CONSUMABLE'; consumableId: string; price?: number }
  | { type: 'USE_CONSUMABLE'; index: number }
  | { type: 'PLAY_PLANET'; consumableId: string }
  | { type: 'SET_HAND_LEVEL'; hand: HandType; level: number }
  | { type: 'SPEND'; amount: number }
  | { type: 'END_RUN'; result: 'won' | 'lost' }
  | { type: 'UNDO' };

const DECK_JOKER_SLOTS: Record<string, number> = { Black: 6, Painted: 4 };
const DECK_START_MONEY: Record<string, number> = { Yellow: 14 };

export function newRunState(deck: string, stake: string): RunState {
  const handLevels = Object.fromEntries(HAND_TYPES.map(h => [h, 1])) as Record<HandType, number>;
  return {
    deck,
    stake,
    ante: 1,
    money: DECK_START_MONEY[deck] ?? 4,
    jokerSlots: DECK_JOKER_SLOTS[deck] ?? 5,
    consumableSlots: 2,
    jokers: [],
    vouchers: [],
    consumables: [],
    handLevels,
    status: 'active',
  };
}

export function initialStore(): StoreState {
  return { current: null, past: [], finished: [] };
}

export function reduce(state: StoreState, action: RunAction): StoreState {
  if (action.type === 'START_RUN') {
    return { ...state, current: newRunState(action.deck, action.stake), past: [] };
  }
  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state;
    return { ...state, current: state.past[state.past.length - 1], past: state.past.slice(0, -1) };
  }

  const run = state.current;
  if (!run) return state;

  const push = (next: RunState | null, extra?: Partial<StoreState>): StoreState => ({
    ...state,
    ...extra,
    current: next,
    past: [...state.past.slice(-49), run],
  });

  switch (action.type) {
    case 'SET_MONEY':
      return push({ ...run, money: action.money });
    case 'SET_ANTE':
      return push({ ...run, ante: Math.max(1, action.ante) });
    case 'SET_JOKER_SLOTS':
      return push({ ...run, jokerSlots: Math.max(1, action.slots) });
    case 'ADD_JOKER':
      return push({
        ...run,
        money: run.money - (action.price ?? 0),
        jokers: [...run.jokers, { jokerId: action.jokerId, edition: action.edition }],
      });
    case 'SET_JOKER_EDITION':
      return push({
        ...run,
        jokers: run.jokers.map((j, i) => (i === action.index ? { ...j, edition: action.edition } : j)),
      });
    case 'SELL_JOKER': {
      const owned = run.jokers[action.index];
      if (!owned) return state;
      const def = getJoker(owned.jokerId);
      const refund = def ? sellValue(def.cost, owned.edition) : 0;
      return push({
        ...run,
        money: run.money + refund,
        jokers: run.jokers.filter((_, i) => i !== action.index),
      });
    }
    case 'REDEEM_VOUCHER': {
      let { jokerSlots, consumableSlots, ante } = run;
      if (action.voucherId === 'antimatter') jokerSlots += 1;
      if (action.voucherId === 'crystal-ball') consumableSlots += 1;
      if (action.voucherId === 'hieroglyph' || action.voucherId === 'petroglyph') ante = Math.max(1, ante - 1);
      return push({
        ...run,
        money: run.money - (action.price ?? 0),
        jokerSlots,
        consumableSlots,
        ante,
        vouchers: [...run.vouchers, action.voucherId],
      });
    }
    case 'ADD_CONSUMABLE':
      return push({
        ...run,
        money: run.money - (action.price ?? 0),
        consumables: [...run.consumables, action.consumableId],
      });
    case 'USE_CONSUMABLE': {
      const id = run.consumables[action.index];
      if (id === undefined) return state;
      const def = getConsumable(id);
      const handLevels =
        def?.kind === 'planet' && def.hand
          ? { ...run.handLevels, [def.hand]: run.handLevels[def.hand] + 1 }
          : run.handLevels;
      return push({
        ...run,
        handLevels,
        consumables: run.consumables.filter((_, i) => i !== action.index),
      });
    }
    case 'PLAY_PLANET': {
      const def = getConsumable(action.consumableId);
      if (def?.kind !== 'planet' || !def.hand) return state;
      return push({ ...run, handLevels: { ...run.handLevels, [def.hand]: run.handLevels[def.hand] + 1 } });
    }
    case 'SET_HAND_LEVEL':
      return push({ ...run, handLevels: { ...run.handLevels, [action.hand]: Math.max(1, action.level) } });
    case 'SPEND':
      return push({ ...run, money: run.money - action.amount });
    case 'END_RUN':
      return push(null, {
        finished: [
          { deck: run.deck, stake: run.stake, ante: run.ante, result: action.result, endedAt: new Date().toISOString() },
          ...state.finished,
        ],
      });
  }
}

export const STORAGE_KEY = 'bal-track:v1';

export function save(state: StoreState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode etc.) — app still works, just not persistent
  }
}

export function load(): StoreState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoreState) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/run/runStore.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/run/
git commit -m "feat: run state reducer with undo and localStorage persistence"
```

---

### Task 9: Archetype detection

**Files:**
- Create: `src/engine/archetype.ts`
- Test: `src/engine/archetype.test.ts`

- [ ] **Step 1: Write the failing test**

`src/engine/archetype.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { detectArchetype } from './archetype';
import type { RunState } from '../types';

function runWith(jokerIds: string[]): RunState {
  return { ...newRunState('Red', 'White'), jokers: jokerIds.map(jokerId => ({ jokerId, edition: 'base' as const })) };
}

describe('detectArchetype', () => {
  it('finds no dominant tags on an empty run', () => {
    expect(detectArchetype(runWith([])).dominant).toEqual([]);
  });

  it('needs at least two jokers sharing a tag', () => {
    expect(detectArchetype(runWith(['droll-joker'])).dominant).toEqual([]);
  });

  it('detects a flush build from two flush-support jokers', () => {
    const profile = detectArchetype(runWith(['droll-joker', 'crafty-joker']));
    expect(profile.dominant).toContain('flush-support');
    expect(profile.counts.get('flush-support')).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/archetype.test.ts`
Expected: FAIL — cannot resolve `./archetype`.

- [ ] **Step 3: Write the implementation**

`src/engine/archetype.ts`:

```ts
import { getJoker } from '../catalog/catalog';
import type { HandType, RunState, SynergyTag } from '../types';

export interface ArchetypeProfile {
  counts: Map<SynergyTag, number>;
  /** Tags appearing on 2+ owned jokers, most frequent first. */
  dominant: SynergyTag[];
}

/** Which poker hands a build archetype cares about (for planet card advice). */
export const TAG_HAND_AFFINITY: Partial<Record<SynergyTag, HandType[]>> = {
  'flush-support': ['Flush', 'Flush House', 'Flush Five'],
  'straight-support': ['Straight', 'Straight Flush'],
  'pair-support': ['Pair', 'Two Pair', 'Three of a Kind', 'Full House', 'Four of a Kind'],
};

export function detectArchetype(run: RunState): ArchetypeProfile {
  const counts = new Map<SynergyTag, number>();
  for (const owned of run.jokers) {
    const def = getJoker(owned.jokerId);
    if (!def) continue;
    for (const tag of def.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const dominant = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
  return { counts, dominant };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/engine/archetype.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/archetype.ts src/engine/archetype.test.ts
git commit -m "feat: build archetype detection from joker synergy tags"
```

---

### Task 10: Shop recommendation engine

**Files:**
- Create: `src/engine/recommend.ts`
- Test: `src/engine/recommend.test.ts` (pack-pick tests are added in Task 11)

- [ ] **Step 1: Write the failing test**

`src/engine/recommend.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newRunState } from '../run/runStore';
import { recommend } from './recommend';
import type { RunState, ShopState } from '../types';

function run(overrides: Partial<RunState> = {}): RunState {
  return { ...newRunState('Red', 'White'), ...overrides };
}

function shop(overrides: Partial<ShopState> = {}): ShopState {
  return { cards: [], voucherId: null, packIds: [], rerollCost: 5, ...overrides };
}

function owned(...jokerIds: string[]) {
  return jokerIds.map(jokerId => ({ jokerId, edition: 'base' as const }));
}

describe('recommend — economy awareness', () => {
  it('advises against a weak buy that breaks an interest tier', () => {
    const recs = recommend(
      run({ money: 24, jokers: owned('golden-joker') }),
      shop({ cards: [{ kind: 'joker', jokerId: 'joker', edition: 'base', price: 6 }] }),
    );
    expect(recs[0].kind).not.toBe('buy-joker');
    const buy = recs.find(r => r.kind === 'buy-joker');
    expect(buy?.reasons.join(' ')).toMatch(/interest/i);
  });

  it('marks unaffordable items instead of recommending them', () => {
    const recs = recommend(
      run({ money: 3 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }] }),
    );
    const buy = recs.find(r => r.kind === 'buy-joker');
    expect(buy?.score).toBe(0);
    expect(buy?.reasons.join(' ')).toMatch(/Not affordable/);
  });
});

describe('recommend — strong buys', () => {
  it('puts a high-value joker on top with high confidence', () => {
    const recs = recommend(
      run({ money: 40, ante: 4 }),
      shop({ cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }] }),
    );
    expect(recs[0].kind).toBe('buy-joker');
    expect(recs[0].action).toBe('Buy Blueprint ($10)');
    expect(recs[0].confidence).toBe('high');
  });

  it('rewards synergy with the detected build', () => {
    const base = { money: 20, jokers: owned('droll-joker', 'crafty-joker') };
    const withSynergy = recommend(
      run(base),
      shop({ cards: [{ kind: 'joker', jokerId: 'greedy-joker', edition: 'base', price: 5 }] }),
    );
    const buy = withSynergy.find(r => r.kind === 'buy-joker');
    // greedy-joker shares no dominant tag with a flush build → no synergy bonus mentioned
    expect(buy?.reasons.join(' ')).not.toMatch(/Fits your build/);
  });
});

describe('recommend — full joker slots', () => {
  it('suggests selling the weakest joker for a clear upgrade', () => {
    const recs = recommend(
      run({
        money: 30,
        ante: 4,
        jokers: owned('joker', 'droll-joker', 'crafty-joker', 'golden-joker', 'cavendish'),
      }),
      shop({ cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }] }),
    );
    expect(recs[0].kind).toBe('sell-and-buy');
    expect(recs[0].action).toMatch(/^Sell Joker, buy Blueprint/);
    expect(recs[0].reasons.join(' ')).toMatch(/Slots full/);
  });
});

describe('recommend — vouchers and packs', () => {
  it('discounts vouchers late in the run', () => {
    const recs = recommend(run({ money: 20, ante: 7 }), shop({ voucherId: 'telescope' }));
    const voucher = recs.find(r => r.kind === 'buy-voucher');
    expect(voucher?.reasons.join(' ')).toMatch(/Late in the run/);
  });

  it('recommends a celestial pack early', () => {
    const recs = recommend(run({ money: 20 }), shop({ packIds: ['celestial-normal'] }));
    expect(recs[0].kind).toBe('buy-pack');
    expect(recs[0].action).toBe('Buy Celestial Pack ($4)');
  });
});

describe('recommend — reroll and skip', () => {
  it('always offers reroll and skip as ranked actions', () => {
    const recs = recommend(run(), shop());
    expect(recs.some(r => r.kind === 'reroll')).toBe(true);
    expect(recs.some(r => r.kind === 'skip')).toBe(true);
  });

  it('explains the interest earned when skipping', () => {
    const recs = recommend(run({ money: 25 }), shop());
    const skip = recs.find(r => r.kind === 'skip');
    expect(skip?.reasons.join(' ')).toMatch(/\$5 interest/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/recommend.test.ts`
Expected: FAIL — cannot resolve `./recommend`.

- [ ] **Step 3: Write the implementation**

`src/engine/recommend.ts`:

```ts
import { getConsumable, getJoker, getPack, getVoucher } from '../catalog/catalog';
import { phaseForAnte } from '../types';
import type {
  Edition, Phase, RecKind, Recommendation, RunState, ShopCardSlot, ShopState,
} from '../types';
import { detectArchetype, TAG_HAND_AFFINITY } from './archetype';
import type { ArchetypeProfile } from './archetype';
import { interest, interestCapFor, interestLost, sellValue } from './economy';

export const EDITION_SCORE_BONUS: Record<Edition, number> = {
  base: 0,
  foil: 0.5,
  holographic: 0.8,
  polychrome: 1.5,
  negative: 2.5, // also does not use a slot
};

function rec(kind: RecKind, action: string, score: number, reasons: string[], refId?: string): Recommendation {
  return { kind, action, score, confidence: 'low', reasons, refId };
}

function finalize(recs: Recommendation[]): Recommendation[] {
  return [...recs]
    .sort((a, b) => b.score - a.score)
    .map(r => ({ ...r, confidence: r.score >= 7 ? 'high' : r.score >= 4 ? 'medium' : 'low' }));
}

function economyNotes(run: RunState, price: number, weight: number): { penalty: number; notes: string[] } {
  const cap = interestCapFor(run.vouchers);
  const lost = interestLost(run.money, price, cap);
  if (lost <= 0) return { penalty: 0, notes: [] };
  return {
    penalty: lost * weight,
    notes: [`Drops your interest by $${lost}/round ($${run.money} → $${run.money - price})`],
  };
}

function usedJokerSlots(run: RunState): number {
  return run.jokers.filter(j => j.edition !== 'negative').length;
}

/** Heuristic value of an owned joker in the current context (used to find the weakest). */
function ownedJokerValue(run: RunState, index: number, phase: Phase, profile: ArchetypeProfile): number {
  const owned = run.jokers[index];
  const def = getJoker(owned.jokerId);
  if (!def) return 0;
  const synergy = def.tags.filter(t => profile.dominant.includes(t)).length;
  return def.rating[phase] + Math.min(3, synergy * 1.2) + EDITION_SCORE_BONUS[owned.edition];
}

function planetBonus(run: RunState, profile: ArchetypeProfile, consumableId: string): { bonus: number; notes: string[] } {
  const def = getConsumable(consumableId);
  if (def?.kind !== 'planet' || !def.hand) return { bonus: 0, notes: [] };
  let bonus = 0;
  const notes: string[] = [];
  if (profile.dominant.some(t => (TAG_HAND_AFFINITY[t] ?? []).includes(def.hand!))) {
    bonus += 2;
    notes.push(`Levels ${def.hand} — matches your build`);
  }
  const level = run.handLevels[def.hand];
  if (level > 1) {
    bonus += Math.min(2, (level - 1) * 0.5);
    notes.push(`${def.hand} is already level ${level} — keep stacking it`);
  }
  return { bonus, notes };
}

function evalShopCard(run: RunState, slot: ShopCardSlot, phase: Phase, profile: ArchetypeProfile): Recommendation {
  if (slot.kind === 'consumable') {
    const def = getConsumable(slot.consumableId);
    if (!def) return rec('buy-consumable', 'Buy unknown card', 0, ['Unknown catalog id']);
    const action = `Buy ${def.name} ($${slot.price})`;
    if (slot.price > run.money) {
      return rec('buy-consumable', action, 0, [`Not affordable ($${slot.price} > $${run.money})`], def.id);
    }
    let score = def.rating;
    const reasons: string[] = [def.effect];
    const planet = planetBonus(run, profile, def.id);
    score += planet.bonus;
    reasons.push(...planet.notes);
    if (run.consumables.length >= run.consumableSlots) {
      score -= 1;
      reasons.push('Your consumable slots are full');
    }
    const econ = economyNotes(run, slot.price, 0.8);
    score -= econ.penalty;
    reasons.push(...econ.notes);
    return rec('buy-consumable', action, score, reasons, def.id);
  }

  const def = getJoker(slot.jokerId);
  if (!def) return rec('buy-joker', 'Buy unknown joker', 0, ['Unknown catalog id']);
  const action = `Buy ${def.name} ($${slot.price})`;
  if (slot.price > run.money) {
    return rec('buy-joker', action, 0, [`Not affordable ($${slot.price} > $${run.money})`], def.id);
  }

  const synMatches = def.tags.filter(t => profile.dominant.includes(t));
  let score = def.rating[phase] + Math.min(3, synMatches.length * 1.2) + EDITION_SCORE_BONUS[slot.edition];
  const reasons: string[] = [`${def.rarity} joker rated ${def.rating[phase]}/10 at this stage`];
  if (synMatches.length > 0) reasons.push(`Fits your build: ${synMatches.join(', ')}`);
  if (slot.edition !== 'base') reasons.push(`${slot.edition} edition is a bonus`);
  const econ = economyNotes(run, slot.price, 0.8);
  score -= econ.penalty;
  reasons.push(...econ.notes);

  const slotsFull = usedJokerSlots(run) >= run.jokerSlots && slot.edition !== 'negative';
  if (!slotsFull) return rec('buy-joker', action, score, reasons, def.id);

  // Slots full: compare against the weakest owned joker.
  let weakestIndex = -1;
  let weakestValue = Infinity;
  run.jokers.forEach((o, i) => {
    if (o.edition === 'negative') return;
    const v = ownedJokerValue(run, i, phase, profile);
    if (v < weakestValue) {
      weakestValue = v;
      weakestIndex = i;
    }
  });
  const weakest = run.jokers[weakestIndex];
  const weakestDef = weakest ? getJoker(weakest.jokerId) : undefined;
  if (weakestDef && score > weakestValue + 1) {
    return rec(
      'sell-and-buy',
      `Sell ${weakestDef.name}, buy ${def.name} ($${slot.price})`,
      score - weakestValue * 0.4,
      [
        ...reasons,
        `Slots full — ${weakestDef.name} is your weakest (${weakestValue.toFixed(1)} vs ${score.toFixed(1)})`,
        `Selling refunds $${sellValue(weakestDef.cost, weakest.edition)}`,
      ],
      def.id,
    );
  }
  return rec('buy-joker', action, Math.min(score, 2), [
    ...reasons,
    'Joker slots are full and nothing is clearly worth selling for this',
  ], def.id);
}

function evalVoucher(run: RunState, voucherId: string, phase: Phase): Recommendation {
  const def = getVoucher(voucherId);
  if (!def) return rec('buy-voucher', 'Buy unknown voucher', 0, ['Unknown catalog id']);
  const action = `Buy ${def.name} ($${def.cost})`;
  if (def.cost > run.money) {
    return rec('buy-voucher', action, 0, [`Not affordable ($${def.cost} > $${run.money})`], def.id);
  }
  let score = def.rating;
  const reasons: string[] = [def.effect];
  if (phase === 'late') {
    score -= 1.5;
    reasons.push('Late in the run — less time to profit from it');
  }
  const econ = economyNotes(run, def.cost, 0.5);
  score -= econ.penalty;
  reasons.push(...econ.notes);
  return rec('buy-voucher', action, score, reasons, def.id);
}

function evalPack(run: RunState, packId: string, phase: Phase): Recommendation {
  const def = getPack(packId);
  if (!def) return rec('buy-pack', 'Buy unknown pack', 0, ['Unknown catalog id']);
  const action = `Buy ${def.name} ($${def.cost})`;
  if (def.cost > run.money) {
    return rec('buy-pack', action, 0, [`Not affordable ($${def.cost} > $${run.money})`], def.id);
  }
  let score = def.rating[phase];
  const reasons: string[] = [`${def.options} options, pick ${def.picks}`];
  const econ = economyNotes(run, def.cost, 0.6);
  score -= econ.penalty;
  reasons.push(...econ.notes);
  return rec('buy-pack', action, score, reasons, def.id);
}

function evalReroll(run: RunState, shop: ShopState, bestBuy: number): Recommendation {
  const action = `Reroll ($${shop.rerollCost})`;
  if (shop.rerollCost > run.money) {
    return rec('reroll', action, 0, [`Not affordable ($${shop.rerollCost} > $${run.money})`]);
  }
  let score = 1.5;
  const reasons: string[] = [`Costs $${shop.rerollCost}`];
  if (bestBuy < 4) {
    score += 2.5;
    reasons.push('Current offers are weak — fishing for better is reasonable');
  }
  if (interestLost(run.money, shop.rerollCost, interestCapFor(run.vouchers)) === 0) {
    score += 1;
    reasons.push('Rerolling costs you no interest');
  }
  return rec('reroll', action, score, reasons);
}

function evalSkip(run: RunState, bestBuy: number): Recommendation {
  const cap = interestCapFor(run.vouchers);
  const earned = interest(run.money, cap);
  let score = 3 + Math.min(1, earned * 0.15);
  const reasons: string[] = [`Banking $${run.money} earns $${earned} interest per round`];
  if (bestBuy >= 7) {
    score -= 1.5;
    reasons.push('But there is a strong buy available');
  } else if (bestBuy < 4) {
    reasons.push('Nothing in this shop is a clear upgrade');
  }
  return rec('skip', 'Buy nothing', score, reasons);
}

export function recommend(run: RunState, shop: ShopState): Recommendation[] {
  const phase = phaseForAnte(run.ante);
  const profile = detectArchetype(run);
  const buys: Recommendation[] = [];
  for (const slot of shop.cards) buys.push(evalShopCard(run, slot, phase, profile));
  if (shop.voucherId) buys.push(evalVoucher(run, shop.voucherId, phase));
  for (const packId of shop.packIds) buys.push(evalPack(run, packId, phase));
  const bestBuy = buys.reduce((max, r) => Math.max(max, r.score), 0);
  return finalize([...buys, evalReroll(run, shop, bestBuy), evalSkip(run, bestBuy)]);
}

/**
 * Ranks the options inside an opened booster pack.
 * `optionIds` may contain joker ids (Buffoon packs) and consumable ids.
 */
export function recommendPackPick(run: RunState, optionIds: string[]): Recommendation[] {
  const phase = phaseForAnte(run.ante);
  const profile = detectArchetype(run);
  const recs = optionIds.map(id => {
    const joker = getJoker(id);
    if (joker) {
      const synMatches = joker.tags.filter(t => profile.dominant.includes(t));
      const score = joker.rating[phase] + Math.min(3, synMatches.length * 1.2);
      const reasons: string[] = [`Rated ${joker.rating[phase]}/10 at this stage`];
      if (synMatches.length > 0) reasons.push(`Fits your build: ${synMatches.join(', ')}`);
      if (usedJokerSlots(run) >= run.jokerSlots) reasons.push('Careful: your joker slots are full');
      return rec('pick', `Take ${joker.name}`, score, reasons, id);
    }
    const c = getConsumable(id);
    if (!c) return rec('pick', `Take ${id}`, 0, ['Unknown catalog id']);
    let score = c.rating;
    const reasons: string[] = [c.effect];
    const planet = planetBonus(run, profile, c.id);
    score += planet.bonus;
    reasons.push(...planet.notes);
    return rec('pick', `Take ${c.name}`, score, reasons, id);
  });
  return finalize(recs);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/engine/recommend.test.ts`
Expected: PASS (9 tests). If a ranking test fails, do NOT tweak the test — check the arithmetic against the scoring rules above; the scenarios were computed by hand:
- weak-buy test: buy = 3 − 0.8 = 2.2 < skip ≈ 3.6 < reroll = 4.0
- strong-buy test: blueprint mid = 9, no interest lost at $40 → top, high confidence
- sell-and-buy test: blueprint 9 − 0.8 = 8.2 vs weakest (`joker` mid = 2 + 1.2 synergy = 3.2) → composite wins

- [ ] **Step 5: Commit**

```bash
git add src/engine/recommend.ts src/engine/recommend.test.ts
git commit -m "feat: shop recommendation engine with economy and synergy scoring"
```

---

### Task 11: Pack-pick engine tests

**Files:**
- Modify: `src/engine/recommend.test.ts` (append a describe block; `recommendPackPick` itself was implemented in Task 10)

- [ ] **Step 1: Write the failing-or-passing test (append to `src/engine/recommend.test.ts`)**

```ts
import { recommendPackPick } from './recommend';

describe('recommendPackPick', () => {
  it('prefers the planet that matches the build', () => {
    const flushRun = run({ jokers: owned('droll-joker', 'crafty-joker') });
    const picks = recommendPackPick(flushRun, ['mercury', 'jupiter']);
    expect(picks[0].action).toBe('Take Jupiter');
    expect(picks[0].reasons.join(' ')).toMatch(/matches your build/);
  });

  it('always ranks The Soul on top', () => {
    const picks = recommendPackPick(run(), ['jupiter', 'the-soul']);
    expect(picks[0].action).toBe('Take The Soul');
  });

  it('ranks buffoon-pack jokers with synergy', () => {
    const picks = recommendPackPick(run(), ['joker', 'blueprint']);
    expect(picks[0].action).toBe('Take Blueprint');
  });
});
```

Note: `recommendPackPick` must be added to the existing import from `'./recommend'` at the top of the file instead of a second import statement, and `run`/`owned` helpers already exist in this file.

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -- src/engine/recommend.test.ts`
Expected: PASS (12 tests). The implementation already exists from Task 10 — this task locks its behavior in tests. If any fail, fix `recommendPackPick`, not the tests.

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: PASS — all test files green.

- [ ] **Step 4: Commit**

```bash
git add src/engine/recommend.test.ts
git commit -m "test: lock pack-pick ranking behavior"
```

---

### Task 12: React shell, RunContext, RunSetup screen

**Files:**
- Create: `src/run/RunContext.tsx`, `src/ui/screens/RunSetup.tsx`, `src/ui/screens/RunOverview.tsx` (minimal stub, completed in Task 14), `src/ui/screens/ShopScreen.tsx` (stub), `src/ui/screens/PackScreen.tsx` (stub), `src/ui/screens/HistoryScreen.tsx` (stub)
- Modify: `src/App.tsx` (replace placeholder)
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing smoke test**

`src/App.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import App from './App';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

it('starts a new run from the setup screen', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Yellow' }));
  await userEvent.click(screen.getByRole('button', { name: 'White' }));
  await userEvent.click(screen.getByRole('button', { name: 'Start Run' }));
  expect(screen.getByText('Ante')).toBeInTheDocument();
  expect(screen.getByDisplayValue('14')).toBeInTheDocument(); // Yellow deck starts with $14
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL — App is still the placeholder.

- [ ] **Step 3: Write RunContext**

`src/run/RunContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useReducer } from 'react';
import type { ReactNode } from 'react';
import { initialStore, load, reduce, save } from './runStore';
import type { RunAction, StoreState } from './runStore';

interface RunContextValue {
  store: StoreState;
  dispatch: (action: RunAction) => void;
}

const Ctx = createContext<RunContextValue | null>(null);

export function RunProvider({ children }: { children: ReactNode }) {
  const [store, dispatch] = useReducer(reduce, undefined, () => load() ?? initialStore());
  useEffect(() => {
    save(store);
  }, [store]);
  return <Ctx.Provider value={{ store, dispatch }}>{children}</Ctx.Provider>;
}

export function useRun(): RunContextValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useRun must be used inside RunProvider');
  return value;
}
```

- [ ] **Step 4: Write RunSetup and the screen stubs**

`src/ui/screens/RunSetup.tsx`:

```tsx
import { useState } from 'react';
import meta from '../../data/meta.json';
import { useRun } from '../../run/RunContext';

export default function RunSetup({ onStarted }: { onStarted: () => void }) {
  const { dispatch } = useRun();
  const [deck, setDeck] = useState('Red');
  const [stake, setStake] = useState('White');
  return (
    <section className="screen">
      <h1>Bal-Track</h1>
      <h2>New Run</h2>
      <h3>Deck</h3>
      <div className="chip-grid">
        {meta.decks.map(d => (
          <button key={d} className={d === deck ? 'chip active' : 'chip'} onClick={() => setDeck(d)}>
            {d}
          </button>
        ))}
      </div>
      <h3>Stake</h3>
      <div className="chip-grid">
        {meta.stakes.map(s => (
          <button key={s} className={s === stake ? 'chip active' : 'chip'} onClick={() => setStake(s)}>
            {s}
          </button>
        ))}
      </div>
      <button
        className="primary"
        onClick={() => {
          dispatch({ type: 'START_RUN', deck, stake });
          onStarted();
        }}
      >
        Start Run
      </button>
      <p className="muted">Special decks: check money and joker slots on the Run screen after starting.</p>
    </section>
  );
}
```

Stubs (each in its own file, replaced in Tasks 14–17):

`src/ui/screens/RunOverview.tsx`:

```tsx
import { useRun } from '../../run/RunContext';
import NumberField from '../components/NumberField';

export default function RunOverview() {
  const { store, dispatch } = useRun();
  const run = store.current!;
  return (
    <section className="screen">
      <NumberField label="Money $" value={run.money} onChange={money => dispatch({ type: 'SET_MONEY', money })} />
      <NumberField label="Ante" value={run.ante} min={1} onChange={ante => dispatch({ type: 'SET_ANTE', ante })} />
    </section>
  );
}
```

`src/ui/screens/ShopScreen.tsx`:

```tsx
export default function ShopScreen() {
  return <section className="screen">Shop — coming in Task 15</section>;
}
```

`src/ui/screens/PackScreen.tsx`:

```tsx
export default function PackScreen() {
  return <section className="screen">Pack — coming in Task 16</section>;
}
```

`src/ui/screens/HistoryScreen.tsx`:

```tsx
export default function HistoryScreen() {
  return <section className="screen">History — coming in Task 17</section>;
}
```

The stub RunOverview needs `NumberField` — create it now (it belongs to Task 13's file set but the stub depends on it):

`src/ui/components/NumberField.tsx`:

```tsx
interface Props {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}

export default function NumberField({ label, value, min = 0, onChange }: Props) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div className="stepper">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <input
          type="number"
          value={value}
          min={min}
          onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
        />
        <button type="button" onClick={() => onChange(value + 1)}>+</button>
      </div>
    </label>
  );
}
```

- [ ] **Step 5: Replace `src/App.tsx`**

```tsx
import { useState } from 'react';
import { RunProvider, useRun } from './run/RunContext';
import HistoryScreen from './ui/screens/HistoryScreen';
import PackScreen from './ui/screens/PackScreen';
import RunOverview from './ui/screens/RunOverview';
import RunSetup from './ui/screens/RunSetup';
import ShopScreen from './ui/screens/ShopScreen';

type Screen = 'run' | 'shop' | 'pack' | 'history';

const TABS: { id: Screen; label: string }[] = [
  { id: 'run', label: 'Run' },
  { id: 'shop', label: 'Shop' },
  { id: 'pack', label: 'Pack' },
  { id: 'history', label: 'History' },
];

function Shell() {
  const { store } = useRun();
  const [screen, setScreen] = useState<Screen>('run');

  if (!store.current) {
    if (screen === 'history') {
      return (
        <div className="app">
          <HistoryScreen />
          <button className="primary" onClick={() => setScreen('run')}>New Run</button>
        </div>
      );
    }
    return (
      <div className="app">
        <RunSetup onStarted={() => setScreen('run')} />
        {store.finished.length > 0 && (
          <button className="ghost" onClick={() => setScreen('history')}>History</button>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <nav className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={t.id === screen ? 'tab active' : 'tab'} onClick={() => setScreen(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {screen === 'run' && <RunOverview />}
      {screen === 'shop' && <ShopScreen />}
      {screen === 'pack' && <PackScreen />}
      {screen === 'history' && <HistoryScreen />}
    </div>
  );
}

export default function App() {
  return (
    <RunProvider>
      <Shell />
    </RunProvider>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/App.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/run/RunContext.tsx src/ui/
git commit -m "feat: app shell with run context, setup screen and tab navigation"
```

---

### Task 13: Shared UI components — AutocompleteInput, RecommendationList

**Files:**
- Create: `src/ui/components/AutocompleteInput.tsx`, `src/ui/components/RecommendationList.tsx`
- (`NumberField.tsx` already exists from Task 12.)

No dedicated test file — both are exercised by the screen tests in Tasks 14–16. Build them exactly as specified so those tests pass.

- [ ] **Step 1: Write AutocompleteInput**

`src/ui/components/AutocompleteInput.tsx`:

```tsx
import { useState } from 'react';
import { searchCatalog } from '../../catalog/search';
import type { SearchItem, SearchKind } from '../../catalog/search';

interface Props {
  placeholder: string;
  kinds: SearchKind[];
  onPick: (item: SearchItem) => void;
}

export default function AutocompleteInput({ placeholder, kinds, onPick }: Props) {
  const [query, setQuery] = useState('');
  const results = query.trim() ? searchCatalog(query, kinds) : [];
  return (
    <div className="autocomplete">
      <input
        value={query}
        placeholder={placeholder}
        onChange={e => setQuery(e.target.value)}
        inputMode="search"
        autoComplete="off"
      />
      {results.length > 0 && (
        <ul className="autocomplete-results">
          {results.map(r => (
            <li key={`${r.kind}:${r.id}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  setQuery('');
                }}
              >
                <span>{r.name}</span>
                <small>{r.sub}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write RecommendationList**

`src/ui/components/RecommendationList.tsx`:

```tsx
import type { Recommendation } from '../../types';

export default function RecommendationList({ recs }: { recs: Recommendation[] }) {
  if (recs.length === 0) {
    return <p className="muted">Add shop items above to get advice.</p>;
  }
  return (
    <ol className="recs">
      {recs.map((r, i) => (
        <li key={i} className={`rec rec-${r.confidence}${i === 0 ? ' rec-top' : ''}`}>
          <div className="rec-head">
            <strong>{r.action}</strong>
            <span className="rec-meta">
              {r.score.toFixed(1)} · {r.confidence}
            </span>
          </div>
          <ul>
            {r.reasons.map((why, j) => (
              <li key={j}>{why}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 3: Verify compilation and existing tests**

Run: `npm test`
Expected: PASS — nothing broken; the new components compile (`npm run build` also passes).

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/
git commit -m "feat: autocomplete input and recommendation list components"
```

---

### Task 14: RunOverview screen

**Files:**
- Modify: `src/ui/screens/RunOverview.tsx` (replace the stub entirely)
- Test: `src/ui/screens/RunOverview.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/ui/screens/RunOverview.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import App from '../../App';
import { STORAGE_KEY, newRunState } from '../../run/runStore';

beforeEach(() => {
  localStorage.clear();
  const run = { ...newRunState('Red', 'White'), money: 10, jokers: [{ jokerId: 'golden-joker', edition: 'base' }] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: run, past: [], finished: [] }));
});
afterEach(cleanup);

it('sells a joker and refunds the sell value', async () => {
  render(<App />);
  expect(screen.getByText('Golden Joker')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Sell \$3/ }));
  expect(screen.getByDisplayValue('13')).toBeInTheDocument(); // 10 + 3 refund
  expect(screen.queryByText('Golden Joker')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/ui/screens/RunOverview.test.tsx`
Expected: FAIL — the stub has no joker list.

- [ ] **Step 3: Replace `src/ui/screens/RunOverview.tsx`**

```tsx
import { getConsumable, getJoker, getVoucher } from '../../catalog/catalog';
import { sellValue } from '../../engine/economy';
import { useRun } from '../../run/RunContext';
import { HAND_TYPES } from '../../types';
import type { Edition } from '../../types';
import AutocompleteInput from '../components/AutocompleteInput';
import NumberField from '../components/NumberField';

const EDITIONS: Edition[] = ['base', 'foil', 'holographic', 'polychrome', 'negative'];

export default function RunOverview() {
  const { store, dispatch } = useRun();
  const run = store.current!;
  return (
    <section className="screen">
      <header className="row spread">
        <h2>{run.deck} Deck · {run.stake}</h2>
        <button className="ghost" onClick={() => dispatch({ type: 'UNDO' })} disabled={store.past.length === 0}>
          Undo
        </button>
      </header>

      <div className="row">
        <NumberField label="Money $" value={run.money} onChange={money => dispatch({ type: 'SET_MONEY', money })} />
        <NumberField label="Ante" value={run.ante} min={1} onChange={ante => dispatch({ type: 'SET_ANTE', ante })} />
        <NumberField label="Joker slots" value={run.jokerSlots} min={1} onChange={slots => dispatch({ type: 'SET_JOKER_SLOTS', slots })} />
      </div>

      <h3>Jokers ({run.jokers.filter(j => j.edition !== 'negative').length}/{run.jokerSlots})</h3>
      <ul className="rows">
        {run.jokers.map((owned, i) => {
          const def = getJoker(owned.jokerId);
          if (!def) return null;
          return (
            <li key={i} className="row">
              <span className="grow">{def.name}</span>
              <select
                value={owned.edition}
                aria-label={`${def.name} edition`}
                onChange={e => dispatch({ type: 'SET_JOKER_EDITION', index: i, edition: e.target.value as Edition })}
              >
                {EDITIONS.map(ed => (
                  <option key={ed} value={ed}>{ed}</option>
                ))}
              </select>
              <button onClick={() => dispatch({ type: 'SELL_JOKER', index: i })}>
                Sell ${sellValue(def.cost, owned.edition)}
              </button>
            </li>
          );
        })}
      </ul>
      <AutocompleteInput
        placeholder="Add joker…"
        kinds={['joker']}
        onPick={item => dispatch({ type: 'ADD_JOKER', jokerId: item.id, edition: 'base' })}
      />

      <h3>Vouchers</h3>
      <ul className="rows">
        {run.vouchers.map((id, i) => (
          <li key={i}>{getVoucher(id)?.name ?? id}</li>
        ))}
      </ul>
      <AutocompleteInput
        placeholder="Add redeemed voucher…"
        kinds={['voucher']}
        onPick={item => dispatch({ type: 'REDEEM_VOUCHER', voucherId: item.id })}
      />

      <h3>Consumables ({run.consumables.length}/{run.consumableSlots})</h3>
      <ul className="rows">
        {run.consumables.map((id, i) => {
          const def = getConsumable(id);
          return (
            <li key={i} className="row">
              <span className="grow">{def?.name ?? id}</span>
              <button onClick={() => dispatch({ type: 'USE_CONSUMABLE', index: i })}>
                {def?.kind === 'planet' ? 'Use (+1 level)' : 'Used'}
              </button>
            </li>
          );
        })}
      </ul>
      <AutocompleteInput
        placeholder="Add consumable…"
        kinds={['tarot', 'planet', 'spectral']}
        onPick={item => dispatch({ type: 'ADD_CONSUMABLE', consumableId: item.id })}
      />

      <details>
        <summary>Hand levels</summary>
        {HAND_TYPES.map(hand => (
          <NumberField
            key={hand}
            label={hand}
            value={run.handLevels[hand]}
            min={1}
            onChange={level => dispatch({ type: 'SET_HAND_LEVEL', hand, level })}
          />
        ))}
      </details>

      <div className="row">
        <button className="primary" onClick={() => confirm('End this run as WON?') && dispatch({ type: 'END_RUN', result: 'won' })}>
          Run won
        </button>
        <button className="danger" onClick={() => confirm('End this run as LOST?') && dispatch({ type: 'END_RUN', result: 'lost' })}>
          Run lost
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/ui/screens/RunOverview.test.tsx`
Expected: PASS (1 test). Also run `npm test` — the App smoke test must still pass ('Ante' label still exists).

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/RunOverview.tsx src/ui/screens/RunOverview.test.tsx
git commit -m "feat: run overview screen with full state editing"
```

---

### Task 15: ShopScreen with live recommendations

**Files:**
- Modify: `src/ui/screens/ShopScreen.tsx` (replace the stub entirely)
- Test: `src/ui/screens/ShopScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/ui/screens/ShopScreen.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import App from '../../App';
import { STORAGE_KEY, newRunState } from '../../run/runStore';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ current: newRunState('Red', 'White'), past: [], finished: [] }),
  );
});
afterEach(cleanup);

it('recommends a shop joker after entering it', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  await userEvent.type(screen.getByPlaceholderText('Add shop card…'), 'blueprint');
  await userEvent.click(await screen.findByRole('button', { name: /Blueprint/ }));
  expect(screen.getByText(/Buy Blueprint/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/ui/screens/ShopScreen.test.tsx`
Expected: FAIL — the stub has no autocomplete.

- [ ] **Step 3: Replace `src/ui/screens/ShopScreen.tsx`**

```tsx
import { useState } from 'react';
import { getConsumable, getJoker, getPack, getVoucher } from '../../catalog/catalog';
import { recommend } from '../../engine/recommend';
import { useRun } from '../../run/RunContext';
import type { Edition, ShopState } from '../../types';
import AutocompleteInput from '../components/AutocompleteInput';
import NumberField from '../components/NumberField';
import RecommendationList from '../components/RecommendationList';

const EDITIONS: Edition[] = ['base', 'foil', 'holographic', 'polychrome', 'negative'];
const emptyShop: ShopState = { cards: [], voucherId: null, packIds: [], rerollCost: 5 };

export default function ShopScreen() {
  const { store, dispatch } = useRun();
  const run = store.current!;
  const [shop, setShop] = useState<ShopState>(emptyShop);
  const hasItems = shop.cards.length > 0 || shop.voucherId !== null || shop.packIds.length > 0;
  const recs = hasItems ? recommend(run, shop) : [];

  const removeCard = (i: number) => setShop(s => ({ ...s, cards: s.cards.filter((_, j) => j !== i) }));
  const removePack = (i: number) => setShop(s => ({ ...s, packIds: s.packIds.filter((_, j) => j !== i) }));

  return (
    <section className="screen">
      <div className="row">
        <NumberField label="Money $" value={run.money} onChange={money => dispatch({ type: 'SET_MONEY', money })} />
        <NumberField label="Reroll $" value={shop.rerollCost} onChange={rerollCost => setShop(s => ({ ...s, rerollCost }))} />
      </div>

      <h3>Cards on offer</h3>
      <ul className="rows">
        {shop.cards.map((slot, i) => {
          const name = slot.kind === 'joker' ? getJoker(slot.jokerId)?.name : getConsumable(slot.consumableId)?.name;
          return (
            <li key={i} className="row">
              <span className="grow">{name}</span>
              {slot.kind === 'joker' && (
                <select
                  value={slot.edition}
                  aria-label={`${name} edition`}
                  onChange={e =>
                    setShop(s => ({
                      ...s,
                      cards: s.cards.map((c, j) =>
                        j === i && c.kind === 'joker' ? { ...c, edition: e.target.value as Edition } : c,
                      ),
                    }))
                  }
                >
                  {EDITIONS.map(ed => (
                    <option key={ed} value={ed}>{ed}</option>
                  ))}
                </select>
              )}
              <NumberField
                label="$"
                value={slot.price}
                onChange={price =>
                  setShop(s => ({ ...s, cards: s.cards.map((c, j) => (j === i ? { ...c, price } : c)) }))
                }
              />
              <button
                onClick={() => {
                  if (slot.kind === 'joker') {
                    dispatch({ type: 'ADD_JOKER', jokerId: slot.jokerId, edition: slot.edition, price: slot.price });
                  } else {
                    dispatch({ type: 'ADD_CONSUMABLE', consumableId: slot.consumableId, price: slot.price });
                  }
                  removeCard(i);
                }}
              >
                Bought
              </button>
              <button className="ghost" onClick={() => removeCard(i)}>✕</button>
            </li>
          );
        })}
      </ul>
      <AutocompleteInput
        placeholder="Add shop card…"
        kinds={['shop-joker', 'tarot', 'planet', 'spectral']}
        onPick={item =>
          setShop(s =>
            item.kind === 'shop-joker'
              ? { ...s, cards: [...s.cards, { kind: 'joker', jokerId: item.id, edition: 'base', price: getJoker(item.id)?.cost ?? 0 }] }
              : { ...s, cards: [...s.cards, { kind: 'consumable', consumableId: item.id, price: getConsumable(item.id)?.cost ?? 0 }] },
          )
        }
      />

      <h3>Voucher</h3>
      {shop.voucherId ? (
        <div className="row">
          <span className="grow">{getVoucher(shop.voucherId)?.name}</span>
          <button
            onClick={() => {
              dispatch({ type: 'REDEEM_VOUCHER', voucherId: shop.voucherId!, price: getVoucher(shop.voucherId!)?.cost ?? 10 });
              setShop(s => ({ ...s, voucherId: null }));
            }}
          >
            Redeemed
          </button>
          <button className="ghost" onClick={() => setShop(s => ({ ...s, voucherId: null }))}>✕</button>
        </div>
      ) : (
        <AutocompleteInput placeholder="Add voucher…" kinds={['voucher']} onPick={item => setShop(s => ({ ...s, voucherId: item.id }))} />
      )}

      <h3>Booster packs</h3>
      <ul className="rows">
        {shop.packIds.map((id, i) => {
          const def = getPack(id);
          if (!def) return null;
          return (
            <li key={i} className="row">
              <span className="grow">{def.name}</span>
              <button
                onClick={() => {
                  dispatch({ type: 'SPEND', amount: def.cost });
                  removePack(i);
                }}
              >
                Bought ${def.cost}
              </button>
              <button className="ghost" onClick={() => removePack(i)}>✕</button>
            </li>
          );
        })}
      </ul>
      <AutocompleteInput placeholder="Add pack…" kinds={['pack']} onPick={item => setShop(s => ({ ...s, packIds: [...s.packIds, item.id] }))} />
      <p className="muted">Bought a pack? Enter its contents on the Pack tab for pick advice.</p>

      <div className="row">
        <button
          onClick={() => {
            dispatch({ type: 'SPEND', amount: shop.rerollCost });
            setShop(s => ({ ...s, cards: [], rerollCost: s.rerollCost + 1 }));
          }}
        >
          Rerolled
        </button>
        <button className="ghost" onClick={() => setShop(emptyShop)}>Clear shop</button>
      </div>

      <h3>Advice</h3>
      <RecommendationList recs={recs} />
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/ui/screens/ShopScreen.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/ShopScreen.tsx src/ui/screens/ShopScreen.test.tsx
git commit -m "feat: shop entry screen with live ranked recommendations"
```

---

### Task 16: PackScreen

**Files:**
- Modify: `src/ui/screens/PackScreen.tsx` (replace the stub entirely)
- Test: `src/ui/screens/PackScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/ui/screens/PackScreen.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import App from '../../App';
import { STORAGE_KEY, newRunState } from '../../run/runStore';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ current: newRunState('Red', 'White'), past: [], finished: [] }),
  );
});
afterEach(cleanup);

it('levels a hand when a planet is taken from a celestial pack', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Pack' }));
  await userEvent.click(screen.getByRole('button', { name: 'celestial' }));
  await userEvent.type(screen.getByPlaceholderText('Add pack option…'), 'jup');
  await userEvent.click(await screen.findByRole('button', { name: /Jupiter/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Took Jupiter' }));
  await userEvent.click(screen.getByRole('button', { name: 'Run' }));
  expect(screen.getByDisplayValue('2')).toBeInTheDocument(); // Flush is now level 2
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/ui/screens/PackScreen.test.tsx`
Expected: FAIL — the stub has no pack UI.

- [ ] **Step 3: Replace `src/ui/screens/PackScreen.tsx`**

```tsx
import { useState } from 'react';
import { getConsumable, getJoker } from '../../catalog/catalog';
import { recommendPackPick } from '../../engine/recommend';
import { useRun } from '../../run/RunContext';
import type { PackKind } from '../../types';
import type { SearchKind } from '../../catalog/search';
import AutocompleteInput from '../components/AutocompleteInput';
import RecommendationList from '../components/RecommendationList';

const OPTION_KINDS: Record<PackKind, SearchKind[]> = {
  arcana: ['tarot', 'spectral'], // Omen Globe can add spectrals to Arcana packs
  celestial: ['planet'],
  spectral: ['spectral'],
  buffoon: ['shop-joker'],
  standard: [],
};

const KINDS: PackKind[] = ['arcana', 'celestial', 'buffoon', 'spectral', 'standard'];

function optionName(id: string): string {
  return getJoker(id)?.name ?? getConsumable(id)?.name ?? id;
}

export default function PackScreen() {
  const { store, dispatch } = useRun();
  const run = store.current!;
  const [kind, setKind] = useState<PackKind>('arcana');
  const [options, setOptions] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const recs = options.length > 0 ? recommendPackPick(run, options) : [];

  const take = (id: string) => {
    const joker = getJoker(id);
    if (joker) {
      dispatch({ type: 'ADD_JOKER', jokerId: id, edition: 'base' });
      setNote(`${joker.name} added to your jokers.`);
    } else {
      const c = getConsumable(id);
      if (c?.kind === 'planet') {
        dispatch({ type: 'PLAY_PLANET', consumableId: id });
        setNote(`${c.name} used — hand level raised.`);
      } else if (id === 'the-soul') {
        setNote('The Soul! Add your new legendary joker on the Run tab.');
      } else if (c) {
        setNote(`${c.name} — deck changes are not tracked, nothing to update.`);
      }
    }
    setOptions(current => current.filter(o => o !== id));
  };

  return (
    <section className="screen">
      <h3>Pack type</h3>
      <div className="chip-grid">
        {KINDS.map(k => (
          <button
            key={k}
            className={k === kind ? 'chip active' : 'chip'}
            onClick={() => {
              setKind(k);
              setOptions([]);
              setNote(null);
            }}
          >
            {k}
          </button>
        ))}
      </div>

      {kind === 'standard' ? (
        <p className="muted">
          Standard packs contain playing cards, which bal-track does not evaluate individually. Rule of thumb: take
          cards with seals, editions or enhancements that fit your build; otherwise skipping is fine.
        </p>
      ) : (
        <>
          <h3>Options in the pack</h3>
          <ul className="rows">
            {options.map(id => (
              <li key={id}>{optionName(id)}</li>
            ))}
          </ul>
          <AutocompleteInput
            placeholder="Add pack option…"
            kinds={OPTION_KINDS[kind]}
            onPick={item => setOptions(current => (current.includes(item.id) ? current : [...current, item.id]))}
          />

          <h3>Advice</h3>
          <RecommendationList recs={recs} />
          {recs.length > 0 && (
            <div className="rows">
              {options.map(id => (
                <button key={id} onClick={() => take(id)}>
                  Took {optionName(id)}
                </button>
              ))}
            </div>
          )}
          {note && <p className="note">{note}</p>}
          <button className="ghost" onClick={() => { setOptions([]); setNote(null); }}>Clear</button>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/ui/screens/PackScreen.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/PackScreen.tsx src/ui/screens/PackScreen.test.tsx
git commit -m "feat: pack-opening screen with pick advice"
```

---

### Task 17: HistoryScreen and run end flow

**Files:**
- Modify: `src/ui/screens/HistoryScreen.tsx` (replace the stub entirely)

The END_RUN reducer behavior is already tested (Task 8); this task is UI only.

- [ ] **Step 1: Replace `src/ui/screens/HistoryScreen.tsx`**

```tsx
import { useRun } from '../../run/RunContext';

export default function HistoryScreen() {
  const { store } = useRun();
  if (store.finished.length === 0) {
    return (
      <section className="screen">
        <p className="muted">No finished runs yet.</p>
      </section>
    );
  }
  return (
    <section className="screen">
      <h2>Past runs</h2>
      <ul className="rows">
        {store.finished.map((r, i) => (
          <li key={i} className="row">
            <span className="grow">{r.deck} · {r.stake}</span>
            <span>Ante {r.ante}</span>
            <span className={r.result === 'won' ? 'won' : 'lost'}>{r.result}</span>
            <small>{new Date(r.endedAt).toLocaleDateString()}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Verify manually in the dev server**

Run: `npm run dev`, open the printed URL. Start a run, press "Run lost", confirm — the app returns to the setup screen and a "History" button appears; it lists the finished run. (jsdom `confirm` returns true is not exercised here; this is a real-browser check.)

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/HistoryScreen.tsx
git commit -m "feat: run history screen"
```

---

### Task 18: Mobile stylesheet

**Files:**
- Modify: `src/styles.css` (replace entirely)

- [ ] **Step 1: Replace `src/styles.css`**

```css
:root {
  --bg: #14101b;
  --panel: #1f1830;
  --panel-2: #292040;
  --text: #ece6f2;
  --muted: #9a8fb0;
  --accent: #e0533d;
  --accent-2: #4f9de0;
  --good: #4fc06a;
  --bad: #e05a5a;
  --radius: 10px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.app {
  max-width: 520px;
  margin: 0 auto;
  padding: 12px 12px calc(16px + env(safe-area-inset-bottom));
}

h1 { font-size: 1.6rem; margin: 8px 0; }
h2 { font-size: 1.15rem; margin: 10px 0 6px; }
h3 { font-size: 0.95rem; margin: 14px 0 6px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }

button {
  font: inherit;
  color: var(--text);
  background: var(--panel-2);
  border: 1px solid #3a2f55;
  border-radius: var(--radius);
  padding: 10px 14px;
  min-height: 44px;
  cursor: pointer;
}
button:active { transform: scale(0.98); }
button:disabled { opacity: 0.4; }

button.primary { background: var(--accent); border-color: var(--accent); font-weight: 600; }
button.danger { background: var(--bad); border-color: var(--bad); }
button.ghost { background: transparent; }

.tabs {
  display: flex;
  gap: 6px;
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg);
  padding: 8px 0;
}
.tab { flex: 1; }
.tab.active { background: var(--accent); border-color: var(--accent); font-weight: 600; }

.screen { display: flex; flex-direction: column; gap: 4px; }

.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.row.spread { justify-content: space-between; }
.grow { flex: 1; }

.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rows > li { background: var(--panel); border-radius: var(--radius); padding: 8px 10px; }

.chip-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { min-height: 38px; padding: 6px 12px; border-radius: 999px; }
.chip.active { background: var(--accent-2); border-color: var(--accent-2); font-weight: 600; }

.number-field { display: flex; flex-direction: column; gap: 2px; font-size: 0.85rem; color: var(--muted); }
.stepper { display: flex; align-items: center; gap: 4px; }
.stepper button { min-height: 38px; min-width: 38px; padding: 4px; }
.stepper input {
  width: 64px;
  text-align: center;
  font: inherit;
  color: var(--text);
  background: var(--panel);
  border: 1px solid #3a2f55;
  border-radius: var(--radius);
  padding: 8px 4px;
  min-height: 38px;
}

.autocomplete { position: relative; margin: 4px 0; }
.autocomplete input {
  width: 100%;
  font: inherit;
  color: var(--text);
  background: var(--panel);
  border: 1px solid #3a2f55;
  border-radius: var(--radius);
  padding: 10px 12px;
  min-height: 44px;
}
.autocomplete-results {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  background: var(--panel-2);
  border: 1px solid #3a2f55;
  border-radius: var(--radius);
  overflow: hidden;
}
.autocomplete-results button {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  border: 0;
  border-radius: 0;
  background: transparent;
  text-align: left;
}
.autocomplete-results button:hover { background: var(--panel); }
.autocomplete-results small { color: var(--muted); }

select {
  font: inherit;
  color: var(--text);
  background: var(--panel);
  border: 1px solid #3a2f55;
  border-radius: var(--radius);
  padding: 8px;
  min-height: 38px;
}

.recs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; counter-reset: rec; }
.rec { background: var(--panel); border-radius: var(--radius); padding: 10px 12px; border-left: 4px solid var(--muted); }
.rec-top { border-left-color: var(--good); background: var(--panel-2); }
.rec-high { }
.rec-low { opacity: 0.75; }
.rec-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.rec-meta { color: var(--muted); font-size: 0.8rem; white-space: nowrap; }
.rec ul { margin: 6px 0 0; padding-left: 18px; color: var(--muted); font-size: 0.9rem; }

.muted { color: var(--muted); font-size: 0.9rem; }
.note { color: var(--good); }
.won { color: var(--good); font-weight: 600; }
.lost { color: var(--bad); font-weight: 600; }

details summary { cursor: pointer; color: var(--muted); padding: 8px 0; }
```

- [ ] **Step 2: Verify**

Run: `npm test` — Expected: PASS (styles don't affect tests).
Run: `npm run dev` and check on a narrow viewport (~380px): tabs stick to the top, buttons are comfortably tappable, autocomplete results render as a list below the input, the top recommendation has a green left border.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: dark mobile-first stylesheet"
```

---

### Task 19: PWA — manifest, icons, service worker

**Files:**
- Create: `scripts/gen-icons.mjs`
- Modify: `vite.config.ts`

- [ ] **Step 1: Write the icon generator**

`scripts/gen-icons.mjs` (writes solid-color PNGs with no external dependencies):

```js
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const row = Buffer.alloc(1 + size * 3); // filter byte 0 + RGB pixels
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array(size).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
const balatroRed = [224, 83, 61];
writeFileSync('public/pwa-192.png', png(192, balatroRed));
writeFileSync('public/pwa-512.png', png(512, balatroRed));
console.log('icons written to public/');
```

Run: `npm run icons`
Expected: prints "icons written to public/".

Run: `file public/pwa-512.png`
Expected: `PNG image data, 512 x 512, 8-bit/color RGB, non-interlaced`.

- [ ] **Step 2: Add the PWA plugin to `vite.config.ts`** (replace the file)

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Bal-Track — Balatro Shop Advisor',
        short_name: 'Bal-Track',
        description: 'Manual Balatro run tracker with shop recommendations',
        theme_color: '#1a1423',
        background_color: '#14101b',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
});
```

- [ ] **Step 3: Verify the build produces a service worker**

Run: `npm run build && ls dist/`
Expected: `dist/` contains `sw.js` and `manifest.webmanifest` alongside the app bundle.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/gen-icons.mjs vite.config.ts public/pwa-192.png public/pwa-512.png
git commit -m "feat: installable PWA with generated icons and service worker"
```

---

### Task 20: README and final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Bal-Track — Balatro Shop Advisor

A mobile-first PWA that acts as a second-screen advisor for Balatro runs on
platforms without mod or save-file access (mobile, Switch, Xbox). You enter
your run state and each shop's contents manually (fast autocomplete over the
full card catalog); the app returns ranked, explained recommendations for
every shop decision — buy/sell/reroll/skip, vouchers, packs, and pack picks.

Recommendations are heuristic: phase-dependent card ratings, synergy tags
matched against your detected build, and interest-aware economy rules. Every
recommendation states its reasons — trust your own judgment when it matters.

## Develop

- `npm install`
- `npm run dev` — dev server
- `npm test` — run the test suite
- `npm run build` — typecheck + production build (`dist/`)

## Deploy

Any static host over HTTPS works (required for the service worker). Upload
the contents of `dist/`.

## Data

Catalog data (`src/data/*.json`) is transcribed from the community wiki;
ratings/tags are hand-curated heuristics — tweak them freely, the validation
tests in `src/data/` keep the structure honest.
```

- [ ] **Step 2: Full verification**

Run: `npm test`
Expected: PASS — every suite green.

Run: `npm run build`
Expected: clean typecheck and build.

Run: `npm run dev` and walk the loop once in the browser: Start run → Shop tab → add a card, a voucher, a pack → advice appears and reorders as you change money → mark something bought → Pack tab → enter options, take one → Run tab shows the updated state → end the run → History lists it.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with usage and deploy notes"
```

---

## Plan complete

Total: 20 tasks. After Task 20, all spec requirements are implemented:
manual entry with autocomplete (Tasks 3–6, 13), run tracking with undo and
persistence (Task 8), heuristic shop advice incl. sell/reroll/skip and economy
(Task 10), pack-content advice (Tasks 11, 16), PWA installability (Task 19).
Deployment target (GitHub Pages vs. own webspace) is decided with the user
after Task 20 — not part of this plan.
