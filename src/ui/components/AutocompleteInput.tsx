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
