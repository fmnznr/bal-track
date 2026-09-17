import { useState } from 'react';
import { getConsumable, getJoker } from '../../catalog/catalog';
import { hasFreeJokerSlot } from '../../engine/gameRules';
import { recommendPackPick } from '../../engine/recommend';
import { CONVERSION_TARGETS, hasProfileEffect } from '../../run/profileEffects';
import { useT } from '../../i18n/I18nContext';
import { useRun } from '../../run/RunContext';
import type { PackKind, Suit } from '../../types';
import type { SearchKind } from '../../catalog/search';
import AutocompleteInput from '../components/AutocompleteInput';
import RecommendationList from '../components/RecommendationList';
import SuitPrompt from '../components/SuitPrompt';

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
  const t = useT();
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
  const [conversion, setConversion] = useState<{ name: string; target: Suit } | null>(null);
  const recs = options.length > 0 ? recommendPackPick(run, options) : [];

  const take = (id: string) => {
    const joker = getJoker(id);
    if (joker) {
      if (!hasFreeJokerSlot(run, 'base')) {
        setNote(t('noFreeSlotNote', { name: joker.name }));
        return;
      }
      dispatch({ type: 'ADD_JOKER', jokerId: id, edition: 'base' });
      setNote(t('addedToJokers', { name: joker.name }));
    } else {
      const c = getConsumable(id);
      if (c?.kind === 'planet') {
        dispatch({ type: 'PLAY_PLANET', consumableId: id });
        setNote(t('planetUsedNote', { name: c.name }));
      } else if (id === 'the-soul') {
        setNote(t('theSoulNote'));
      } else if (c) {
        dispatch({ type: 'APPLY_CONSUMABLE', consumableId: id });
        const target = CONVERSION_TARGETS[id];
        if (target) {
          setConversion({ name: c.name, target });
          setNote(t('tellSuitsNote', { name: c.name }));
        } else if (hasProfileEffect(id)) {
          setNote(t('profileUpdatedNote', { name: c.name }));
        } else {
          setNote(t('notTrackedNote', { name: c.name }));
        }
      }
    }
    setOptions(current => current.filter(o => o !== id));
  };

  return (
    <section className="screen">
      <h3>{t('packType')}</h3>
      <div className="chip-grid">
        {KINDS.map(k => (
          <button
            key={k}
            aria-pressed={k === kind}
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
        <p className="muted">{t('packStandardNote')}</p>
      ) : (
        <>
          <h3>{t('optionsInPack')}</h3>
          <ul className="rows">
            {options.map(id => (
              <li key={id}>{optionName(id)}</li>
            ))}
          </ul>
          <AutocompleteInput
            placeholder={t('addPackOption')}
            kinds={OPTION_KINDS[kind]}
            onPick={item => setOptions(current => (current.includes(item.id) ? current : [...current, item.id]))}
          />

          <h3>{t('advice')}</h3>
          <RecommendationList recs={recs} />
          {recs.length > 0 && (
            <div className="rows">
              {options.map(id => (
                <button key={id} onClick={() => take(id)}>
                  {t('took', { name: optionName(id) })}
                </button>
              ))}
            </div>
          )}
          {note && <p className="note">{note}</p>}
          {conversion && (
            <SuitPrompt consumableName={conversion.name} target={conversion.target} onDone={() => setConversion(null)} />
          )}
          <button className="ghost" onClick={() => { setOptions([]); setNote(null); }}>{t('clear')}</button>
        </>
      )}
    </section>
  );
}
