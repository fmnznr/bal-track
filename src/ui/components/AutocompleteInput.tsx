import { useId, useState } from 'react';
import { searchCatalog } from '../../catalog/search';
import type { SearchItem, SearchKind } from '../../catalog/search';

interface Props {
  placeholder: string;
  kinds: SearchKind[];
  onPick: (item: SearchItem) => void;
}

export default function AutocompleteInput({ placeholder, kinds, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const results = query.trim() ? searchCatalog(query, kinds) : [];
  const pick = (item: SearchItem) => {
    onPick(item);
    setQuery('');
    setActiveIndex(0);
  };
  return (
    <div className="autocomplete">
      <input
        value={query}
        placeholder={placeholder}
        aria-label={placeholder.replace('…', '')}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={results.length > 0}
        aria-controls={results.length > 0 ? listId : undefined}
        aria-activedescendant={results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        onChange={e => {
          setQuery(e.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={event => {
          if (results.length === 0) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex(index => (index + 1) % results.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(index => (index - 1 + results.length) % results.length);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            pick(results[activeIndex] ?? results[0]);
          } else if (event.key === 'Escape') {
            setQuery('');
          }
        }}
        inputMode="search"
        autoComplete="off"
      />
      {results.length > 0 && (
        <ul id={listId} role="listbox" className="autocomplete-results">
          {results.map((r, index) => (
            <li
              key={`${r.kind}:${r.id}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                className={index === activeIndex ? 'active' : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pick(r)}
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
