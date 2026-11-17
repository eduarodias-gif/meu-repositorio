export type PersistedQueueSummary = {
  queue: number;
  completed: number;
  review: number;
  errors: number;
  restricted: number;
  total: number;
};

export type DashboardMetrics = {
  queue: number;
  completed: number;
  review: number;
  total: number;
  progress: number;
};

export function toDashboardMetrics(summary: PersistedQueueSummary): DashboardMetrics;
