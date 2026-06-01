export type StaticRateCardSource = {
  key: string;
  rateCardId: string;
  unitsToAdd: number;
  autoAddUnits: boolean;
  assigneeMode: "default" | "fixed" | "runtime";
  assignToProfessional: boolean;
  assignedTo: string | null;
  source: "step" | "form";
  itemIndex: number | null;
};

export const normalizeRateCardUnits = (value: any, fallback = 1) => {
  const rawValue = value === undefined || value === null || value === "" ? fallback : value;
  const units = Number(rawValue);
  return Number.isFinite(units) && units >= 0 ? units : fallback;
};

export const isInvalidRateCardUnits = (value: any) => {
  if (value === undefined || value === null || value === "") return true;
  const units = Number(value);
  return !Number.isFinite(units) || units < 0;
};

const normalizeUnits = (value: any) => normalizeRateCardUnits(value);

const normalizeAutoAddUnits = (value: any) => value !== false;

const normalizeAssignee = (value: any) =>
  typeof value === "string" && value.trim() && value !== "DYNAMIC" ? value.trim() : null;

const normalizeAssigneeMode = (item: any): StaticRateCardSource["assigneeMode"] => {
  if (item?.assigneeMode === "runtime") return "runtime";
  if (item?.assigneeMode === "fixed") return "fixed";
  if (item?.assignToProfessional && normalizeAssignee(item?.assignedTo)) return "fixed";
  return "default";
};

const normalizeAssignToProfessional = (item: any) =>
  normalizeAssigneeMode(item) !== "default";

export const getStaticRateCardAssignee = (
  source: Pick<StaticRateCardSource, "assigneeMode" | "assignedTo">,
  fallbackAssignee?: string | null,
  runtimeAssignee?: string | null,
) => {
  if (source.assigneeMode === "fixed" && source.assignedTo) return source.assignedTo;
  if (source.assigneeMode === "runtime") return normalizeAssignee(runtimeAssignee) || source.assignedTo || normalizeAssignee(fallbackAssignee);
  return normalizeAssignee(fallbackAssignee);
};

export const getStaticRateCardSources = (step: any): StaticRateCardSource[] => {
  const sources: StaticRateCardSource[] = [];

  if (Array.isArray(step?.rateCards) && step.rateCards.length > 0) {
    step.rateCards.forEach((item: any, index: number) => {
      if (!item?.rateCardId) return;
      sources.push({
        key: `step:${item.id || item.rateCardId}:${index}`,
        rateCardId: item.rateCardId,
        unitsToAdd: normalizeUnits(item.unitsToAdd),
        autoAddUnits: normalizeAutoAddUnits(item.autoAddUnits),
        assigneeMode: normalizeAssigneeMode(item),
        assignToProfessional: normalizeAssignToProfessional(item),
        assignedTo: normalizeAssignee(item.assignedTo),
        source: "step",
        itemIndex: index,
      });
    });
  } else if (step?.rateCardId) {
    sources.push({
      key: "step:legacy",
      rateCardId: step.rateCardId,
      unitsToAdd: normalizeUnits(step.unitsToAdd),
      autoAddUnits: normalizeAutoAddUnits(step.autoAddUnits),
      assigneeMode: normalizeAssigneeMode(step),
      assignToProfessional: normalizeAssignToProfessional(step),
      assignedTo: normalizeAssignee(step.assignedTo),
      source: "step",
      itemIndex: null,
    });
  }

  if (Array.isArray(step?.form?.rateCards) && step.form.rateCards.length > 0) {
    step.form.rateCards.forEach((item: any, index: number) => {
      if (!item?.rateCardId) return;
      sources.push({
        key: `form:${item.id || item.rateCardId}:${index}`,
        rateCardId: item.rateCardId,
        unitsToAdd: normalizeUnits(item.unitsToAdd),
        autoAddUnits: normalizeAutoAddUnits(item.autoAddUnits),
        assigneeMode: normalizeAssigneeMode(item),
        assignToProfessional: normalizeAssignToProfessional(item),
        assignedTo: normalizeAssignee(item.assignedTo),
        source: "form",
        itemIndex: index,
      });
    });
  } else if (step?.form?.rateCardId) {
    sources.push({
      key: "form:legacy",
      rateCardId: step.form.rateCardId,
      unitsToAdd: normalizeUnits(step.form.unitsToAdd),
      autoAddUnits: normalizeAutoAddUnits(step.form.autoAddUnits),
      assigneeMode: normalizeAssigneeMode(step.form),
      assignToProfessional: normalizeAssignToProfessional(step.form),
      assignedTo: normalizeAssignee(step.form.assignedTo),
      source: "form",
      itemIndex: null,
    });
  }

  return sources;
};
