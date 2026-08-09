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
  const draft = store.packDraft ?? { kind: 'arcana' as PackKind, options: [] };
  const kind = draft.kind;
  const options = draft.options;
  const setKind = (next: PackKind) => dispatch({ type: 'SET_PACK_DRAFT', draft: { kind: next, options: [] } });
  // Resolves against the render-time draft, not live reducer state: at most
  // one setKind/setOptions call per event handler, or later calls see stale data.
  const setOptions = (update: string[] | ((o: string[]) => string[])) =>
    dispatch({
      type: 'SET_PACK_DRAFT',
      draft: { kind, options: typeof update === 'function' ? update(options) : update },
    });
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
