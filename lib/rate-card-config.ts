export type StaticRateCardSource = {
  key: string;
  rateCardId: string;
  unitsToAdd: number;
  autoAddUnits: boolean;
  source: "step" | "form";
  itemIndex: number | null;
};

const normalizeUnits = (value: any) => {
  const units = Number(value || 1);
  return Number.isFinite(units) && units > 0 ? units : 1;
};

const normalizeAutoAddUnits = (value: any) => value !== false;

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
      source: "form",
      itemIndex: null,
    });
  }

  return sources;
};
