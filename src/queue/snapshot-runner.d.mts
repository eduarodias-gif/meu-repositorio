import type { LocalBo, QueueSnapshot, QueueSummary } from '../services.local';

export interface SnapshotRunnerState {
  rows: LocalBo[];
  summary: QueueSummary;
  revision: number;
  loading: boolean;
  error: string;
  hasData: boolean;
}

export interface SnapshotRunner {
  readonly state: SnapshotRunnerState;
  refresh(): Promise<SnapshotRunnerState>;
  subscribe(listener: (state: SnapshotRunnerState) => void): () => void;
  dispose(): void;
}

export interface SnapshotRunnerOptions {
  fallback?: string;
}

export function createSnapshotRunner(
  fetchSnapshot: () => Promise<QueueSnapshot>,
  options?: SnapshotRunnerOptions,
): SnapshotRunner;

export const EMPTY_QUEUE_SUMMARY: QueueSummary;
