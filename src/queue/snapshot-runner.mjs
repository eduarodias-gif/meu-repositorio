import { toUserError } from '../services/errors.mjs';

const EMPTY_SUMMARY = Object.freeze({ queue: 0, completed: 0, review: 0, errors: 0, restricted: 0, total: 0 });
const INITIAL_STATE = Object.freeze({
  rows: Object.freeze([]),
  summary: EMPTY_SUMMARY,
  revision: 0,
  loading: true,
  error: '',
  hasData: false,
});

export function createSnapshotRunner(fetchSnapshot, options = {}) {
  if (typeof fetchSnapshot !== 'function') {
    throw new TypeError('fetchSnapshot precisa ser uma função.');
  }
  const fallback = options.fallback ?? 'Fila local indisponível. Tente novamente.';

  let currentRequestId = 0;
  let disposed = false;
  let state = INITIAL_STATE;
  const listeners = new Set();

  function emit(patch) {
    state = { ...state, ...patch };
    for (const listener of listeners) {
      try { listener(state); } catch { /* ignora listener quebrado */ }
    }
  }

  async function refresh() {
    if (disposed) return state;
    const requestId = ++currentRequestId;
    emit({ loading: true });
    let snapshot = null;
    let error = null;
    try {
      snapshot = await fetchSnapshot();
    } catch (caught) {
      error = caught;
    }
    if (disposed || requestId !== currentRequestId) return state;
    if (error !== null) {
      emit({ loading: false, error: toUserError(error, fallback) });
      return state;
    }
    if (!snapshot || !Array.isArray(snapshot.rows) || typeof snapshot.summary !== 'object' || snapshot.summary === null) {
      emit({ loading: false, error: fallback });
      return state;
    }
    emit({
      rows: snapshot.rows,
      summary: { ...EMPTY_SUMMARY, ...snapshot.summary },
      revision: Number.isFinite(snapshot.revision) ? snapshot.revision : 0,
      loading: false,
      error: '',
      hasData: true,
    });
    return state;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Listener deve ser função.');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function dispose() {
    disposed = true;
    listeners.clear();
  }

  return {
    get state() { return state; },
    refresh,
    subscribe,
    dispose,
  };
}

export const EMPTY_QUEUE_SUMMARY = EMPTY_SUMMARY;
