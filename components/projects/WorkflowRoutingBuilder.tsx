import React from "react";
import { ArrowRight, GitBranch, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createWorkflowRouteId,
  getWorkflowRouteDescription,
  getWorkflowStepFormFields,
  getWorkflowTargetLabel,
  normalizeWorkflowRoutes,
  routeOperatorNeedsValue,
  WORKFLOW_ROUTE_OPERATORS,
  type WorkflowConditionalRoute,
  type WorkflowRouteOperator,
  type WorkflowRouteTarget,
} from "@/lib/workflow-routing";

type WorkflowRoutingBuilderProps = {
  steps: any[];
  onChange: (steps: any[]) => void;
};

const getDefaultRouteTarget = (currentIndex: number, stepCount: number): WorkflowRouteTarget =>
  currentIndex < stepCount - 1 ? currentIndex + 1 : "complete";

const getTargetOptions = (steps: any[], currentIndex: number) => {
  const futureSteps = steps
    .map((step, index) => ({ step, index }))
    .filter(({ index }) => index > currentIndex);

  return [
    ...futureSteps.map(({ step, index }) => ({
      value: String(index),
      label: `Paso ${index + 1}: ${step.label || "Sin nombre"}`,
    })),
    { value: "complete", label: "Finalizar workflow" },
  ];
};

const targetToSelectValue = (target: WorkflowRouteTarget | undefined, currentIndex: number, stepCount: number) => {
  if (target === "complete") return "complete";
  if (typeof target === "number") return String(target);
  return String(getDefaultRouteTarget(currentIndex, stepCount));
};

const selectValueToTarget = (value: string): WorkflowRouteTarget =>
  value === "complete" ? "complete" : Number(value);

export function WorkflowRoutingBuilder({
  steps,
  onChange,
}: WorkflowRoutingBuilderProps) {
  if (steps.length === 0) return null;

  const updateStep = (stepIndex: number, updates: Record<string, any>) => {
    onChange(
      steps.map((step, index) =>
        index === stepIndex ? { ...step, ...updates } : step
      )
    );
  };

  const updateRoute = (
    stepIndex: number,
    routeId: string,
    updates: Partial<WorkflowConditionalRoute>
  ) => {
    const step = steps[stepIndex];
    const routes = normalizeWorkflowRoutes(step.conditionalRoutes || []);
    updateStep(stepIndex, {
      conditionalRoutes: routes.map((route) =>
        route.id === routeId ? { ...route, ...updates } : route
      ),
    });
  };

  const addRoute = (stepIndex: number) => {
    const step = steps[stepIndex];
    const fields = getWorkflowStepFormFields(step);
    const firstField = fields[0];
    if (!firstField) return;

    const route: WorkflowConditionalRoute = {
      id: createWorkflowRouteId(),
      fieldId: firstField.id,
      fieldLabel: firstField.label,
      operator: "equals",
      value: "",
      targetStepIndex: getDefaultRouteTarget(stepIndex, steps.length),
    };

    updateStep(stepIndex, {
      conditionalRoutes: [...normalizeWorkflowRoutes(step.conditionalRoutes || []), route],
    });
  };

  const removeRoute = (stepIndex: number, routeId: string) => {
    const step = steps[stepIndex];
    updateStep(stepIndex, {
      conditionalRoutes: normalizeWorkflowRoutes(step.conditionalRoutes || []).filter(
        (route) => route.id !== routeId
      ),
    });
  };

  const totalRoutes = steps.reduce(
    (count, step) => count + normalizeWorkflowRoutes(step.conditionalRoutes || []).length,
    0
  );

  return (
    <div className="rounded-xl border border-indigo-100 bg-white/85 p-3 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-indigo-600">
            <GitBranch size={14} />
            Mapa visual de decisiones
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            Usa campos del formulario de cada paso para decidir si el workflow avanza, salta o finaliza.
          </p>
        </div>
        <span className="w-fit rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-700">
          {totalRoutes} rutas
        </span>
      </div>

      <div className="mb-4 overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/80 p-3">
        <div className="flex min-w-max items-stretch gap-2">
          {steps.map((step, index) => {
            const routes = normalizeWorkflowRoutes(step.conditionalRoutes || []);
            return (
              <React.Fragment key={`workflow-route-node-${index}`}>
                <div className="w-56 rounded-xl border border-white bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500">
                        Paso {index + 1}
                      </p>
                      <p className="mt-1 truncate text-xs font-black text-slate-900">
                        {step.label || "Paso sin nombre"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600">
                      {routes.length}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1">
                    {routes.length === 0 ? (
                      <p className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
                        Ruta lineal: {getWorkflowTargetLabel(getDefaultRouteTarget(index, steps.length), steps, index)}
                      </p>
                    ) : (
                      routes.slice(0, 3).map((route) => (
                        <p
                          key={route.id}
                          className="truncate rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700"
                          title={getWorkflowRouteDescription(route, steps, index)}
                        >
                          {getWorkflowRouteDescription(route, steps, index)}
                        </p>
                      ))
                    )}
                    {routes.length > 3 && (
                      <p className="text-[10px] font-bold text-slate-400">
                        +{routes.length - 3} rutas mas
                      </p>
                    )}
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className="flex items-center text-indigo-300">
                    <ArrowRight size={18} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((step, stepIndex) => {
          const fields = getWorkflowStepFormFields(step);
          const routes = normalizeWorkflowRoutes(step.conditionalRoutes || []);
          const defaultTarget = step.defaultNextStepIndex ?? step.defaultNextStepTarget;
          const targetOptions = getTargetOptions(steps, stepIndex);

          return (
            <div key={`workflow-route-editor-${stepIndex}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Decisiones del paso {stepIndex + 1}
                  </p>
                  <p className="truncate text-sm font-black text-slate-800">
                    {step.label || "Paso sin nombre"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={targetToSelectValue(defaultTarget, stepIndex, steps.length)}
                    onChange={(event) =>
                      updateStep(stepIndex, {
                        defaultNextStepIndex: selectValueToTarget(event.target.value),
                      })
                    }
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    title="Ruta por defecto cuando ninguna condicion coincide"
                  >
                    {targetOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        Si no coincide: {option.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addRoute(stepIndex)}
                    disabled={fields.length === 0 || targetOptions.length === 0}
                    className="h-8 border-indigo-100 text-[10px] font-black text-indigo-600 hover:bg-indigo-50"
                  >
                    <Plus size={12} className="mr-1" />
                    Condicion
                  </Button>
                </div>
              </div>

              {fields.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-[10px] font-medium text-slate-500">
                  Agrega un formulario a este paso para crear variables de decision.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {routes.length === 0 && (
                    <p className="rounded-lg bg-white px-3 py-2 text-[10px] font-medium text-slate-500">
                      Sin condiciones. Este paso seguira la ruta por defecto.
                    </p>
                  )}
                  {routes.map((route) => {
                    const needsValue = routeOperatorNeedsValue(route.operator);

                    return (
                      <div
                        key={route.id}
                        className="grid grid-cols-1 gap-2 rounded-xl border border-white bg-white p-2 shadow-sm lg:grid-cols-[minmax(150px,1fr)_140px_minmax(120px,1fr)_minmax(180px,1fr)_36px]"
                      >
                        <select
                          value={route.fieldId}
                          onChange={(event) => {
                            const field = fields.find((candidate: any) => candidate.id === event.target.value);
                            updateRoute(stepIndex, route.id, {
                              fieldId: event.target.value,
                              fieldLabel: field?.label || "",
                            });
                          }}
                          className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          {fields.map((field: any) => (
                            <option key={field.id} value={field.id}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={route.operator}
                          onChange={(event) =>
                            updateRoute(stepIndex, route.id, {
                              operator: event.target.value as WorkflowRouteOperator,
                              value: routeOperatorNeedsValue(event.target.value) ? route.value || "" : "",
                            })
                          }
                          className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          {WORKFLOW_ROUTE_OPERATORS.map((operator) => (
                            <option key={operator.value} value={operator.value}>
                              {operator.label}
                            </option>
                          ))}
                        </select>
                        {needsValue ? (
                          <input
                            value={route.value || ""}
                            onChange={(event) => updateRoute(stepIndex, route.id, { value: event.target.value })}
                            placeholder="Valor esperado"
                            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        ) : (
                          <div className="flex h-9 items-center rounded-lg border border-slate-100 bg-slate-50 px-2 text-[10px] font-bold text-slate-400">
                            No requiere valor
                          </div>
                        )}
                        <select
                          value={targetToSelectValue(route.targetStepIndex, stepIndex, steps.length)}
                          onChange={(event) =>
                            updateRoute(stepIndex, route.id, {
                              targetStepIndex: selectValueToTarget(event.target.value),
                            })
                          }
                          className="h-9 rounded-lg border border-indigo-100 bg-indigo-50 px-2 text-xs font-bold text-indigo-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          {targetOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeRoute(stepIndex, route.id)}
                          className="flex h-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Eliminar condicion"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
