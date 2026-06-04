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

export type RateCardValueType = "currency" | "unit";

export const normalizeDecimalInput = (value: any, fallback = 0) => {
  const rawValue = value === undefined || value === null || value === "" ? fallback : value;
  const normalizedValue = typeof rawValue === "string" ? rawValue.replace(",", ".") : rawValue;
  const numberValue = Number(normalizedValue);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

export const normalizeRateCardUnits = (value: any, fallback = 1) => {
  const units = normalizeDecimalInput(value, fallback);
  return Number.isFinite(units) && units >= 0 ? units : fallback;
};

export const isInvalidRateCardUnits = (value: any) => {
  if (value === undefined || value === null || value === "") return true;
  const units = normalizeDecimalInput(value, Number.NaN);
  return !Number.isFinite(units) || units < 0;
};

export const normalizeRateCardValueType = (value: any): RateCardValueType =>
  value === "unit" || value === "measure" || value === "quantity" ? "unit" : "currency";

export const isCurrencyRateCard = (rateCard: any) =>
  normalizeRateCardValueType(rateCard?.rateType || rateCard?.valueType) === "currency";

export const getRateCardOutputUnit = (rateCard: any) => {
  if (isCurrencyRateCard(rateCard)) return rateCard?.currency || "USD";
  return (
    rateCard?.unitLabel ||
    rateCard?.measureUnit ||
    rateCard?.resultUnit ||
    rateCard?.outputUnit ||
    "unidades"
  );
};

export const formatRateCardNumber = (value: any, maximumFractionDigits = 2) =>
  new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(normalizeDecimalInput(value, 0));

export const formatRateCardUnits = (units: any, rateCard: any, maximumFractionDigits = 2) => {
  const indicator = rateCard?.indicator || rateCard?.inputUnit || "unidades";
  return `${formatRateCardNumber(units, maximumFractionDigits)} ${indicator}`;
};

export const formatRateCardValue = (value: any, rateCard: any, maximumFractionDigits = 2) => {
  const numberValue = normalizeDecimalInput(value, 0);

  if (isCurrencyRateCard(rateCard)) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: rateCard?.currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits,
    }).format(numberValue);
  }

  return `${formatRateCardNumber(numberValue, maximumFractionDigits)} ${getRateCardOutputUnit(rateCard)}`;
};

export const formatRateCardRate = (rate: any, rateCard: any, maximumFractionDigits = 4) => {
  const indicator = rateCard?.indicator || "unidad";
  if (isCurrencyRateCard(rateCard)) {
    return `${formatRateCardValue(rate, rateCard, maximumFractionDigits)} / ${indicator}`;
  }
  return `${formatRateCardNumber(rate, maximumFractionDigits)} ${getRateCardOutputUnit(rateCard)} / ${indicator}`;
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
