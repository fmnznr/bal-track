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
