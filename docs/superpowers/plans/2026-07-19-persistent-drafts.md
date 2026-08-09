# Persistent Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Single task.

**Goal:** Shop and pack entry drafts live in the persisted store so they survive tab switches, app switches and reloads.

**Spec:** `docs/superpowers/specs/2026-07-19-persistent-drafts-design.md`

## Execution notes

Branch `feature/persistent-drafts` off main. Baseline 90 tests. TDD. Usual commit trailer.

### Task 1: Draft state in the store + screen bindings

**Files:** Modify `src/run/runStore.ts`, `src/run/runStore.test.ts`, `src/ui/screens/ShopScreen.tsx`, `src/ui/screens/ShopScreen.test.tsx`, `src/ui/screens/PackScreen.tsx`, `src/ui/screens/PackScreen.test.tsx`

- [ ] **Step 1: Append the failing store tests** to `src/run/runStore.test.ts` (a new describe block; `started()` helper exists):

```ts
describe('drafts', () => {
  const shopDraft = { cards: [], voucherId: 'telescope', packIds: [], rerollCost: 6 };

  it('stores drafts without touching the undo history', () => {
    let s = started();
    const pastLen = s.past.length;
    s = reduce(s, { type: 'SET_SHOP_DRAFT', draft: shopDraft });
    s = reduce(s, { type: 'SET_PACK_DRAFT', draft: { kind: 'celestial', options: ['jupiter'] } });
    expect(s.shopDraft?.voucherId).toBe('telescope');
    expect(s.packDraft?.options).toEqual(['jupiter']);
    expect(s.past.length).toBe(pastLen);
  });

  it('clears drafts when a run ends or a new one starts', () => {
    let s = started();
    s = reduce(s, { type: 'SET_SHOP_DRAFT', draft: shopDraft });
    s = reduce(s, { type: 'SET_PACK_DRAFT', draft: { kind: 'celestial', options: ['jupiter'] } });
    s = reduce(s, { type: 'END_RUN', result: 'lost' });
    expect(s.shopDraft).toBeNull();
    expect(s.packDraft).toBeNull();
    s = reduce(s, { type: 'START_RUN', deck: 'Red', stake: 'White' });
    s = reduce(s, { type: 'SET_PACK_DRAFT', draft: { kind: 'arcana', options: [] } });
    s = reduce(s, { type: 'START_RUN', deck: 'Blue', stake: 'White' });
    expect(s.packDraft).toBeNull();
  });

  it('persists drafts through save and load', () => {
    let s = started();
    s = reduce(s, {
      type: 'SET_SHOP_DRAFT',
      draft: { cards: [{ kind: 'joker', jokerId: 'blueprint', edition: 'base', price: 10 }], voucherId: null, packIds: [], rerollCost: 5 },
    });
    save(s);
    expect(load()?.shopDraft?.cards).toHaveLength(1);
  });

  it('backfills missing draft fields from old saves', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: newRunState('Red', 'White'), past: [], finished: [] }));
    const loaded = load();
    expect(loaded?.shopDraft).toBeNull();
    expect(loaded?.packDraft).toBeNull();
  });
});
```

Run: `npm test -- src/run/runStore.test.ts` → new tests FAIL (type errors count as failures here — the actions don't exist yet), 16 existing PASS.

- [ ] **Step 2: Extend `src/run/runStore.ts`:**

1. Imports: add `PackKind`, `ShopState` to the type imports from `../types`.
2. Types:

```ts
export interface PackDraft {
  kind: PackKind;
  options: string[];
}
```

3. `StoreState` gains `shopDraft: ShopState | null;` and `packDraft: PackDraft | null;`. `initialStore()` returns them as `null`.
4. `RunAction` union gains:

```ts
  | { type: 'SET_SHOP_DRAFT'; draft: ShopState | null }
  | { type: 'SET_PACK_DRAFT'; draft: PackDraft | null }
```

5. `START_RUN` case returns `{ ...state, current: newRunState(...), past: [], shopDraft: null, packDraft: null }`.
6. Inside the main switch (so the `if (!run) return state` guard applies), add BEFORE the other cases — these bypass `push` deliberately (no undo snapshot):

```ts
    case 'SET_SHOP_DRAFT':
      return { ...state, shopDraft: action.draft };
    case 'SET_PACK_DRAFT':
      return { ...state, packDraft: action.draft };
```

7. `END_RUN`'s `push(null, { finished: … })` extra object additionally gets `shopDraft: null, packDraft: null`.
8. `load()` normalizes:

```ts
export function load(): StoreState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoreState>;
    return {
      current: parsed.current ?? null,
      past: parsed.past ?? [],
      finished: parsed.finished ?? [],
      shopDraft: parsed.shopDraft ?? null,
      packDraft: parsed.packDraft ?? null,
    };
  } catch {
    return null;
  }
}
```

Run the store tests → PASS (20 in that file).

- [ ] **Step 3: Append the failing UI tests.**

To `src/ui/screens/ShopScreen.test.tsx`:

```tsx
it('keeps shop entries when switching tabs', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  await userEvent.type(screen.getByPlaceholderText('Add shop card…'), 'blueprint');
  await userEvent.click(await screen.findByRole('button', { name: /Blueprint/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Run' }));
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  expect(screen.getByText(/Buy Blueprint/)).toBeInTheDocument();
});
```

To `src/ui/screens/PackScreen.test.tsx`:

```tsx
it('keeps pack options when switching tabs', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Pack' }));
  await userEvent.click(screen.getByRole('button', { name: 'celestial' }));
  await userEvent.type(screen.getByPlaceholderText('Add pack option…'), 'jup');
  await userEvent.click(await screen.findByRole('button', { name: /Jupiter/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Run' }));
  await userEvent.click(screen.getByRole('button', { name: 'Pack' }));
  expect(screen.getByRole('button', { name: 'Took Jupiter' })).toBeInTheDocument();
});
```

Run them → FAIL (entries vanish).

- [ ] **Step 4: Rewire `src/ui/screens/ShopScreen.tsx`.** Replace the `useState` line with a store-backed adapter (the rest of the component keeps calling `setShop` exactly as before):

```tsx
  const shop = store.shopDraft ?? emptyShop;
  const setShop = (update: ShopState | ((s: ShopState) => ShopState)) =>
    dispatch({ type: 'SET_SHOP_DRAFT', draft: typeof update === 'function' ? update(shop) : update });
```

Remove the now-unused `useState` import if nothing else uses it.

- [ ] **Step 5: Rewire `src/ui/screens/PackScreen.tsx`.** Kind and options come from the draft; the transient `note` stays local:

```tsx
  const draft = store.packDraft ?? { kind: 'arcana' as PackKind, options: [] };
  const kind = draft.kind;
  const options = draft.options;
  const setKind = (next: PackKind) => dispatch({ type: 'SET_PACK_DRAFT', draft: { kind: next, options: [] } });
  const setOptions = (update: string[] | ((o: string[]) => string[])) =>
    dispatch({
      type: 'SET_PACK_DRAFT',
      draft: { kind, options: typeof update === 'function' ? update(options) : update },
    });
```

Adapt the two `useState` lines accordingly (only `note` remains `useState`); the chip onClick becomes `setKind(k)` plus `setNote(null)`; everything else keeps its shape.

- [ ] **Step 6: Verify.** `npm test` → 96 passing (17 files). `npm run build` → clean.

- [ ] **Step 7: Commit** `feat: shop and pack drafts persist across tab switches and reloads`
