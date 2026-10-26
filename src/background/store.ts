import { normalizeState } from '../shared/model';
import { STATE_KEY } from '../shared/messages';
import type { AppState } from '../shared/types';

/** Minimal subset of chrome.storage.StorageArea, so tests can supply a fake. */
export interface KeyValueArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/**
 * The service worker is the only writer of app state. All read-modify-write
 * cycles run through one promise chain, so concurrent messages from many
 * panels can never interleave and overwrite each other with stale data.
 */
export class Store {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private area: KeyValueArea,
    private clock: () => number = Date.now,
  ) {}

  /** Runs `fn` exclusively. Do not call `exclusive`/`update` from inside `fn`. */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  async read(): Promise<AppState> {
    const raw = await this.area.get(STATE_KEY);
    return normalizeState(raw[STATE_KEY], this.clock());
  }

  /** Unsynchronized; only call inside `exclusive`. */
  async apply(fn: (s: AppState, now: number) => AppState): Promise<AppState> {
    const current = await this.read();
    const next = fn(current, this.clock());
    if (next === current) return current;
    const saved = { ...next, rev: current.rev + 1 };
    await this.area.set({ [STATE_KEY]: saved });
    return saved;
  }

  update(fn: (s: AppState, now: number) => AppState): Promise<AppState> {
    return this.exclusive(() => this.apply(fn));
  }
}
