export type WorkflowScheduleMode = "calendar" | "business";

export const normalizeWorkflowScheduleMode = (value: unknown): WorkflowScheduleMode => {
  const cleanValue = String(value || "").toLowerCase();
  return ["business", "business_days", "working_days", "labor", "labor_days"].includes(cleanValue)
    ? "business"
    : "calendar";
};

export const getWorkflowStepPlannedDuration = (step: any): number => {
  const rawValue =
    step?.plannedDurationDays ??
    step?.plannedDays ??
    step?.estimatedDurationDays ??
    step?.durationDays ??
    1;
  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) return 1;
  return Math.max(1, Math.ceil(parsedValue));
};

export const getWorkflowTotalPlannedDays = (steps: any[] = []) =>
  steps.reduce((total, step) => total + getWorkflowStepPlannedDuration(step), 0);

export const cloneDateOnly = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const isBusinessDay = (date: Date) => {
  const day = date.getDay();
  return day !== 0 && day !== 6;
};

const addCalendarDays = (date: Date, days: number) => {
  const nextDate = cloneDateOnly(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const moveToNextBusinessDay = (date: Date) => {
  const nextDate = cloneDateOnly(date);
  while (!isBusinessDay(nextDate)) {
    nextDate.setDate(nextDate.getDate() + 1);
  }
  return nextDate;
};

const addBusinessDaysInclusive = (date: Date, days: number) => {
  let currentDate = moveToNextBusinessDay(date);
  let remainingDays = Math.max(1, Math.ceil(days)) - 1;

  while (remainingDays > 0) {
    currentDate = addCalendarDays(currentDate, 1);
    if (isBusinessDay(currentDate)) remainingDays -= 1;
  }

  return currentDate;
};

const getNextStepStartDate = (date: Date, mode: WorkflowScheduleMode) => {
  const nextDate = addCalendarDays(date, 1);
  return mode === "business" ? moveToNextBusinessDay(nextDate) : nextDate;
};

export const applyWorkflowStepSchedule = <T extends Record<string, any>>(
  steps: T[] = [],
  workflowStartDate: Date,
  scheduleMode: unknown = "calendar",
) => {
  const mode = normalizeWorkflowScheduleMode(scheduleMode);
  let currentStartDate =
    mode === "business" ? moveToNextBusinessDay(workflowStartDate) : cloneDateOnly(workflowStartDate);

  const scheduledSteps = steps.map((step) => {
    const plannedDurationDays = getWorkflowStepPlannedDuration(step);
    const plannedStartDate =
      mode === "business" ? moveToNextBusinessDay(currentStartDate) : cloneDateOnly(currentStartDate);
    const plannedEndDate =
      mode === "business"
        ? addBusinessDaysInclusive(plannedStartDate, plannedDurationDays)
        : addCalendarDays(plannedStartDate, plannedDurationDays - 1);

    currentStartDate = getNextStepStartDate(plannedEndDate, mode);

    return {
      ...step,
      plannedDurationDays,
      plannedStartDate,
      plannedEndDate,
      startDate: plannedStartDate,
      endDate: plannedEndDate,
    };
  });

  const workflowStart = scheduledSteps[0]?.plannedStartDate || currentStartDate;
  const workflowEnd = scheduledSteps[scheduledSteps.length - 1]?.plannedEndDate || workflowStart;

  return {
    workflowStartDate: workflowStart,
    workflowEndDate: workflowEnd,
    workflowScheduleMode: mode,
    workflowTotalPlannedDays: getWorkflowTotalPlannedDays(scheduledSteps),
    steps: scheduledSteps,
  };
};
