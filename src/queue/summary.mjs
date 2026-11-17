export function toDashboardMetrics(summary) {
  const total = Number(summary.total) || 0;
  const completed = Number(summary.completed) || 0;
  return {
    queue: Number(summary.queue) || 0,
    completed,
    review: Number(summary.review) || 0,
    total,
    progress: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}
