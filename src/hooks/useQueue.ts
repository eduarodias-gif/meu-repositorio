import { useCallback, useEffect, useState } from 'react';
import { createSnapshotRunner } from '../queue/snapshot-runner.mjs';
import type { SnapshotRunner, SnapshotRunnerState } from '../queue/snapshot-runner.d.mts';
import { getQueueSnapshot } from '../services.local';

const FALLBACK = 'Fila local indisponível. Tente atualizar após verificar o aplicativo.';

export function useQueue() {
  const [runner] = useState<SnapshotRunner>(() => createSnapshotRunner(getQueueSnapshot, { fallback: FALLBACK }));
  const [state, setState] = useState<SnapshotRunnerState>(runner.state);

  useEffect(() => {
    const unsubscribe = runner.subscribe(setState);
    void runner.refresh();
    return () => {
      unsubscribe();
      runner.dispose();
    };
  }, [runner]);

  const refresh = useCallback(() => {
    void runner.refresh();
  }, [runner]);

  return {
    rows: state.rows,
    summary: state.summary,
    revision: state.revision,
    loading: state.loading,
    error: state.error,
    hasData: state.hasData,
    refresh,
  };
}
