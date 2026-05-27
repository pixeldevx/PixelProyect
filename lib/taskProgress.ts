export const isCompletedTaskStatus = (status?: string | null) =>
  status === "completed" || status === "completed_late" || status === "listo";

export const getProgressForTaskStatus = (
  nextStatus: string,
  currentProgress: number | null | undefined = 0,
) => {
  const progress = Number(currentProgress) || 0;

  if (nextStatus === "completed" || nextStatus === "completed_late" || nextStatus === "listo") {
    return 100;
  }

  if (nextStatus === "in_progress") {
    return progress >= 100 ? 50 : Math.max(progress, 10);
  }

  if (nextStatus === "stuck") {
    return progress >= 100 ? 50 : progress;
  }

  if (nextStatus === "todo" || nextStatus === "pending" || nextStatus === "not_started") {
    return 0;
  }

  return progress;
};
