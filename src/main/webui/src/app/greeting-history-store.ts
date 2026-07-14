import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { withQitsSnapshot } from '@qits/angular';

/**
 * Every name greeted this session, in order. The store exists to demonstrate the qits
 * state-snapshot convention: withQitsSnapshot registers its state in the capture registry, so a
 * feature capture's goal carries the greeting history as "app state at capture".
 */
export const GreetingHistoryStore = signalStore(
  { providedIn: 'root' },
  withState({ greetings: [] as string[] }),
  withQitsSnapshot('greetingHistory'),
  withMethods((store) => ({
    record(name: string): void {
      patchState(store, { greetings: [...store.greetings(), name] });
    },
  })),
);
