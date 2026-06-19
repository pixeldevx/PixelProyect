export type WorkflowRouteOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "greater_than"
  | "less_than";

export type WorkflowRouteTarget = number | "complete" | null;

export type WorkflowConditionalRoute = {
  id: string;
  fieldId: string;
  fieldLabel?: string;
  operator: WorkflowRouteOperator;
  value?: string;
  targetStepIndex: WorkflowRouteTarget;
  label?: string;
};

export const WORKFLOW_ROUTE_OPERATORS: Array<{
  value: WorkflowRouteOperator;
  label: string;
  needsValue: boolean;
}> = [
  { value: "equals", label: "Igual a", needsValue: true },
  { value: "not_equals", label: "Diferente de", needsValue: true },
  { value: "contains", label: "Contiene", needsValue: true },
  { value: "not_contains", label: "No contiene", needsValue: true },
  { value: "is_empty", label: "Esta vacio", needsValue: false },
  { value: "is_not_empty", label: "No esta vacio", needsValue: false },
  { value: "greater_than", label: "Mayor que", needsValue: true },
  { value: "less_than", label: "Menor que", needsValue: true },
];

export const createWorkflowRouteId = () =>
  `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const routeOperatorNeedsValue = (operator?: string) =>
  WORKFLOW_ROUTE_OPERATORS.find((item) => item.value === operator)?.needsValue !== false;

export const getWorkflowStepFormFields = (step: any) =>
  Array.isArray(step?.form?.fields) ? step.form.fields : [];

const normalizeRouteOperator = (value: any): WorkflowRouteOperator => {
  const operator = String(value || "equals") as WorkflowRouteOperator;
  return WORKFLOW_ROUTE_OPERATORS.some((item) => item.value === operator)
    ? operator
    : "equals";
};

const normalizeTarget = (value: any): WorkflowRouteTarget | undefined => {
  if (value === "complete") return "complete";
  if (value === null) return null;
  if (value === undefined || value === "") return undefined;

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

export const normalizeWorkflowRoutes = (routes: any[] = []): WorkflowConditionalRoute[] =>
  routes
    .map((route) => {
      const operator = normalizeRouteOperator(route?.operator);
      const targetStepIndex = normalizeTarget(route?.targetStepIndex ?? route?.target);

      return {
        id: route?.id || createWorkflowRouteId(),
        fieldId: String(route?.fieldId || ""),
        fieldLabel: route?.fieldLabel || "",
        operator,
        value: routeOperatorNeedsValue(operator) ? String(route?.value ?? "") : "",
        targetStepIndex: targetStepIndex ?? null,
        label: route?.label || "",
      };
    })
    .filter((route) => route.fieldId);

export const normalizeWorkflowDefaultTarget = (
  value: any,
  currentIndex: number,
  stepCount: number
): WorkflowRouteTarget | undefined => {
  const normalized = normalizeTarget(value);
  if (normalized === undefined) return undefined;
  if (normalized === null) return undefined;
  if (normalized === "complete") return "complete";
  if (normalized === currentIndex) return undefined;
  return normalized >= 0 && normalized < stepCount ? normalized : undefined;
};

const targetToRuntimeIndex = (
  target: WorkflowRouteTarget | undefined,
  currentIndex: number,
  stepCount: number
): number | null | undefined => {
  if (target === undefined) return undefined;
  if (target === null) return undefined;
  if (target === "complete") return null;
  if (target === currentIndex) return undefined;
  return target >= 0 && target < stepCount ? target : undefined;
};

const isEmptyValue = (value: any) => {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim().length === 0;
};

const toComparableText = (value: any) => {
  if (Array.isArray(value)) return value.map((item) => String(item).toLowerCase());
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value ?? "").trim().toLowerCase();
};

export const evaluateWorkflowRoute = (
  route: WorkflowConditionalRoute,
  formData: Record<string, any> = {}
) => {
  const currentValue = formData?.[route.fieldId];
  const expectedValue = String(route.value ?? "").trim().toLowerCase();

  switch (route.operator) {
    case "is_empty":
      return isEmptyValue(currentValue);
    case "is_not_empty":
      return !isEmptyValue(currentValue);
    case "greater_than": {
      const currentNumber = Number(currentValue);
      const expectedNumber = Number(route.value);
      return Number.isFinite(currentNumber) && Number.isFinite(expectedNumber) && currentNumber > expectedNumber;
    }
    case "less_than": {
      const currentNumber = Number(currentValue);
      const expectedNumber = Number(route.value);
      return Number.isFinite(currentNumber) && Number.isFinite(expectedNumber) && currentNumber < expectedNumber;
    }
    case "not_equals": {
      const comparable = toComparableText(currentValue);
      return Array.isArray(comparable)
        ? !comparable.includes(expectedValue)
        : comparable !== expectedValue;
    }
    case "contains": {
      const comparable = toComparableText(currentValue);
      return Array.isArray(comparable)
        ? comparable.some((item) => item.includes(expectedValue))
        : comparable.includes(expectedValue);
    }
    case "not_contains": {
      const comparable = toComparableText(currentValue);
      return Array.isArray(comparable)
        ? !comparable.some((item) => item.includes(expectedValue))
        : !comparable.includes(expectedValue);
    }
    case "equals":
    default: {
      const comparable = toComparableText(currentValue);
      return Array.isArray(comparable)
        ? comparable.includes(expectedValue)
        : comparable === expectedValue;
    }
  }
};

export const resolveWorkflowNextStepIndex = ({
  steps,
  currentIndex,
  formData,
}: {
  steps: any[];
  currentIndex: number;
  formData?: Record<string, any>;
}): number | null => {
  const stepCount = steps.length;
  const currentStep = steps[currentIndex];
  const linearNext = currentIndex < stepCount - 1 ? currentIndex + 1 : null;
  const routes = normalizeWorkflowRoutes(currentStep?.conditionalRoutes || currentStep?.routes || []);

  for (const route of routes) {
    if (!evaluateWorkflowRoute(route, formData || {})) continue;
    const target = targetToRuntimeIndex(route.targetStepIndex, currentIndex, stepCount);
    if (target !== undefined) return target;
  }

  const defaultTarget = normalizeWorkflowDefaultTarget(
    currentStep?.defaultNextStepIndex ?? currentStep?.defaultNextStepTarget,
    currentIndex,
    stepCount
  );
  const runtimeDefault = targetToRuntimeIndex(defaultTarget, currentIndex, stepCount);

  return runtimeDefault === undefined ? linearNext : runtimeDefault;
};

export const resolveWorkflowPreviousStepIndex = ({
  steps,
  currentIndex,
}: {
  steps: any[];
  currentIndex: number;
}): number | null => {
  const stepCount = Array.isArray(steps) ? steps.length : 0;
  if (stepCount === 0 || currentIndex <= 0 || currentIndex >= stepCount) return null;

  for (let sourceIndex = currentIndex - 1; sourceIndex >= 0; sourceIndex -= 1) {
    const sourceStep = steps[sourceIndex];
    const sourceWasUsed = String(sourceStep?.status || "") === "listo" || Boolean(sourceStep?.completedAt);
    if (!sourceWasUsed) continue;

    const target = resolveWorkflowNextStepIndex({
      steps,
      currentIndex: sourceIndex,
      formData: sourceStep?.formData || {},
    });
    if (target === currentIndex) return sourceIndex;
  }

  return currentIndex - 1;
};

const ACTIVE_WORKFLOW_STEP_STATUSES = new Set(["en_curso", "reproceso", "detenido"]);

export const resolveWorkflowActiveStepIndex = ({
  steps,
  currentIndex = 0,
}: {
  steps: any[];
  currentIndex?: number;
}) => {
  const stepCount = Array.isArray(steps) ? steps.length : 0;
  if (stepCount === 0) return 0;

  const boundedCurrentIndex = Math.min(Math.max(0, Number(currentIndex) || 0), stepCount - 1);
  const explicitActiveIndex = steps.findIndex((step) =>
    ACTIVE_WORKFLOW_STEP_STATUSES.has(String(step?.status || ""))
  );

  if (explicitActiveIndex !== -1) return explicitActiveIndex;
  if (String(steps[boundedCurrentIndex]?.status || "") !== "listo") return boundedCurrentIndex;

  const firstOpenStepIndex = steps.findIndex((step) => String(step?.status || "") !== "listo");
  return firstOpenStepIndex === -1 ? stepCount - 1 : firstOpenStepIndex;
};

export const getWorkflowTargetLabel = (
  target: WorkflowRouteTarget | undefined,
  steps: any[],
  currentIndex: number,
  fallback = "Siguiente paso"
) => {
  const normalized = normalizeWorkflowDefaultTarget(target, currentIndex, steps.length);
  if (normalized === "complete" || normalized === null) return "Finalizar workflow";
  if (typeof normalized === "number") {
    return `Paso ${normalized + 1}: ${steps[normalized]?.label || "Sin nombre"}`;
  }
  return fallback;
};

export const getWorkflowRouteDescription = (
  route: WorkflowConditionalRoute,
  steps: any[],
  currentIndex: number
) => {
  const operatorLabel =
    WORKFLOW_ROUTE_OPERATORS.find((operator) => operator.value === route.operator)?.label || "Igual a";
  const valueLabel = routeOperatorNeedsValue(route.operator) ? ` "${route.value || "..."}"` : "";
  return `${route.fieldLabel || route.fieldId || "Variable"} ${operatorLabel}${valueLabel} -> ${getWorkflowTargetLabel(
    route.targetStepIndex,
    steps,
    currentIndex,
    "Ruta no valida"
  )}`;
};
