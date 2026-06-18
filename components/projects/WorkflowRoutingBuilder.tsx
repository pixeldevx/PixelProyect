"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CheckCircle2,
  ClipboardList,
  GitBranch,
  Maximize2,
  MousePointer2,
  Plus,
  Route,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkflowStepFormBuilderModal } from "@/components/projects/WorkflowStepFormBuilderModal";
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
  rateCards?: any[];
  teamMembers?: any[];
};

const COMPLETE_NODE_ID = "workflow-complete";

const getStepTitle = (step: any, index: number) =>
  String(step?.label || `Paso ${index + 1}`);

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

const targetToNodeId = (target: WorkflowRouteTarget | undefined, currentIndex: number, stepCount: number) => {
  const resolvedTarget = target ?? getDefaultRouteTarget(currentIndex, stepCount);
  if (resolvedTarget === "complete" || resolvedTarget === null) return COMPLETE_NODE_ID;
  if (typeof resolvedTarget !== "number") return null;
  if (resolvedTarget < 0 || resolvedTarget >= stepCount || resolvedTarget === currentIndex) return null;
  return `workflow-step-${resolvedTarget}`;
};

function WorkflowStepNode({ data, selected }: NodeProps) {
  const nodeData = data as any;
  const routeCount = Number(nodeData.routeCount || 0);
  const hasForm = Boolean(nodeData.hasForm);

  return (
    <div
      className={`w-[260px] rounded-2xl border bg-white shadow-xl transition-all ${
        selected
          ? "border-indigo-500 ring-4 ring-indigo-500/15"
          : "border-slate-200 hover:border-indigo-200 hover:shadow-2xl"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-indigo-500" />
      <div className="rounded-t-2xl border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">
              Paso {nodeData.index + 1}
            </p>
            <p className="mt-1 truncate text-sm font-black text-slate-950" title={nodeData.title}>
              {nodeData.title}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-black text-indigo-700">
            {routeCount}
          </span>
        </div>
      </div>
      <div className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
            hasForm ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}>
            {hasForm ? "Con formulario" : "Sin formulario"}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500">
            {nodeData.fieldCount} variables
          </span>
        </div>
        <p className="line-clamp-2 text-[11px] font-semibold text-slate-500">
          {nodeData.description}
        </p>
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-indigo-500" />
    </div>
  );
}

function WorkflowCompleteNode() {
  return (
    <div className="w-[220px] rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 shadow-xl">
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-emerald-500" />
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white">
          <CheckCircle2 size={20} />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
            Salida
          </p>
          <p className="text-sm font-black text-emerald-950">Workflow finalizado</p>
        </div>
      </div>
    </div>
  );
}

const workflowNodeTypes = {
  workflowStep: WorkflowStepNode,
  workflowComplete: WorkflowCompleteNode,
};

export function WorkflowRoutingBuilder({
  steps,
  onChange,
  rateCards = [],
  teamMembers = [],
}: WorkflowRoutingBuilderProps) {
  const [isVisualEditorOpen, setIsVisualEditorOpen] = useState(false);

  if (steps.length === 0) return null;

  const totalRoutes = steps.reduce(
    (count, step) => count + normalizeWorkflowRoutes(step.conditionalRoutes || []).length,
    0
  );
  const variablesCount = steps.reduce(
    (count, step) => count + getWorkflowStepFormFields(step).length,
    0
  );

  return (
    <>
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
              <GitBranch size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-600">
                Mapa visual de decisiones
              </p>
              <h4 className="mt-1 text-base font-black text-slate-950">
                Configura rutas, variables y condiciones en pantalla completa
              </h4>
              <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-slate-500">
                La vista del flujo ya no se edita dentro de este modal. Abre el lienzo para ver todo el workflow como mapa interactivo y configurar cada paso sin perder espacio.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white bg-white/80 px-3 py-2 text-center shadow-sm">
                <p className="text-lg font-black text-slate-950">{steps.length}</p>
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Pasos</p>
              </div>
              <div className="rounded-xl border border-white bg-white/80 px-3 py-2 text-center shadow-sm">
                <p className="text-lg font-black text-indigo-600">{totalRoutes}</p>
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Rutas</p>
              </div>
              <div className="rounded-xl border border-white bg-white/80 px-3 py-2 text-center shadow-sm">
                <p className="text-lg font-black text-emerald-600">{variablesCount}</p>
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Variables</p>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => setIsVisualEditorOpen(true)}
              className="h-12 rounded-2xl bg-slate-950 px-5 text-xs font-black text-white shadow-lg shadow-slate-200 hover:bg-indigo-700"
            >
              <Maximize2 size={14} className="mr-2" />
              Abrir editor full screen
            </Button>
          </div>
        </div>
      </div>

      {isVisualEditorOpen && (
        <WorkflowVisualEditorModal
          steps={steps}
          onChange={onChange}
          onClose={() => setIsVisualEditorOpen(false)}
          rateCards={rateCards}
          teamMembers={teamMembers}
        />
      )}
    </>
  );
}

function WorkflowVisualEditorModal({
  steps,
  onChange,
  onClose,
  rateCards,
  teamMembers,
}: {
  steps: any[];
  onChange: (steps: any[]) => void;
  onClose: () => void;
  rateCards: any[];
  teamMembers: any[];
}) {
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [formStepIndex, setFormStepIndex] = useState<number | null>(null);

  useEffect(() => {
    if (selectedStepIndex >= steps.length) {
      setSelectedStepIndex(Math.max(0, steps.length - 1));
    }
  }, [selectedStepIndex, steps.length]);

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

  const addStepFromCanvas = () => {
    const nextIndex = steps.length;
    onChange([
      ...steps,
      {
        assignedTo: "",
        label: "",
        unitsToAdd: 1,
        autoAddUnits: true,
        rateCards: [],
        plannedDurationDays: 1,
      },
    ]);
    setSelectedStepIndex(nextIndex);
  };

  const removeRoute = (stepIndex: number, routeId: string) => {
    const step = steps[stepIndex];
    updateStep(stepIndex, {
      conditionalRoutes: normalizeWorkflowRoutes(step.conditionalRoutes || []).filter(
        (route) => route.id !== routeId
      ),
    });
  };

  const saveStepForm = (stepIndex: number, form: any) => {
    const step = steps[stepIndex];
    const fields = Array.isArray(form?.fields) ? form.fields : [];
    const nextRoutes = normalizeWorkflowRoutes(step.conditionalRoutes || [])
      .filter((route) => fields.some((field: any) => field.id === route.fieldId))
      .map((route) => {
        const field = fields.find((candidate: any) => candidate.id === route.fieldId);
        return {
          ...route,
          fieldLabel: field?.label || route.fieldLabel || route.fieldId,
        };
      });

    updateStep(stepIndex, {
      form,
      conditionalRoutes: form ? nextRoutes : [],
    });
  };

  const nodes = useMemo<Node[]>(() => {
    const stepNodes = steps.map((step, index) => {
      const fields = getWorkflowStepFormFields(step);
      const routes = normalizeWorkflowRoutes(step.conditionalRoutes || []);

      return {
        id: `workflow-step-${index}`,
        type: "workflowStep",
        position: { x: index * 360, y: index % 2 === 0 ? 0 : 36 },
        data: {
          index,
          title: getStepTitle(step, index),
          routeCount: routes.length,
          fieldCount: fields.length,
          hasForm: Boolean(step.form),
          description:
            routes.length === 0
              ? `Ruta lineal hacia ${getWorkflowTargetLabel(getDefaultRouteTarget(index, steps.length), steps, index)}`
              : routes
                  .slice(0, 2)
                  .map((route) => getWorkflowRouteDescription(route, steps, index))
                  .join(" / "),
        },
      } satisfies Node;
    });

    return [
      ...stepNodes,
      {
        id: COMPLETE_NODE_ID,
        type: "workflowComplete",
        position: { x: Math.max(steps.length, 1) * 360, y: 18 },
        data: {},
      } satisfies Node,
    ];
  }, [steps]);

  const edges = useMemo<Edge[]>(() => {
    const nextEdges: Edge[] = [];

    steps.forEach((step, index) => {
      const routes = normalizeWorkflowRoutes(step.conditionalRoutes || []);
      const defaultTarget = step.defaultNextStepIndex ?? step.defaultNextStepTarget ?? getDefaultRouteTarget(index, steps.length);
      const defaultTargetId = targetToNodeId(defaultTarget, index, steps.length);

      if (defaultTargetId) {
        nextEdges.push({
          id: `default-${index}-${defaultTargetId}`,
          source: `workflow-step-${index}`,
          target: defaultTargetId,
          type: "smoothstep",
          label: routes.length > 0 ? "si no coincide" : "lineal",
          animated: routes.length === 0,
          markerEnd: { type: MarkerType.ArrowClosed, color: routes.length > 0 ? "#94a3b8" : "#4f46e5" },
          style: {
            stroke: routes.length > 0 ? "#94a3b8" : "#4f46e5",
            strokeWidth: routes.length > 0 ? 1.5 : 2.5,
            strokeDasharray: routes.length > 0 ? "6 5" : undefined,
          },
          labelStyle: { fill: "#475569", fontSize: 11, fontWeight: 800 },
          labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
          labelBgPadding: [6, 4],
          labelBgBorderRadius: 8,
        });
      }

      routes.forEach((route, routeIndex) => {
        const targetId = targetToNodeId(route.targetStepIndex, index, steps.length);
        if (!targetId) return;
        const color = routeIndex % 2 === 0 ? "#f97316" : "#7c3aed";
        const label = routeOperatorNeedsValue(route.operator)
          ? `${route.fieldLabel || route.fieldId} ${route.value || "..."}`
          : `${route.fieldLabel || route.fieldId}`;

        nextEdges.push({
          id: route.id || `route-${index}-${routeIndex}`,
          source: `workflow-step-${index}`,
          target: targetId,
          type: "smoothstep",
          label,
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color },
          style: { stroke: color, strokeWidth: 3 },
          labelStyle: { fill: color, fontSize: 11, fontWeight: 900 },
          labelBgStyle: { fill: "#fff7ed", fillOpacity: 0.95 },
          labelBgPadding: [6, 4],
          labelBgBorderRadius: 8,
        });
      });
    });

    return nextEdges;
  }, [steps]);

  const selectedStep = steps[selectedStepIndex];
  const selectedFields = getWorkflowStepFormFields(selectedStep);
  const selectedRoutes = normalizeWorkflowRoutes(selectedStep?.conditionalRoutes || []);
  const selectedDefaultTarget = selectedStep?.defaultNextStepIndex ?? selectedStep?.defaultNextStepTarget;
  const selectedTargetOptions = getTargetOptions(steps, selectedStepIndex);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-950/30">
            <GitBranch size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-black">Editor visual de workflow</h2>
            <p className="text-xs font-semibold text-slate-400">
              {steps.length} pasos visibles · clic en un nodo para configurar formulario, variables y caminos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={addStepFromCanvas}
            className="h-10 border-white/10 bg-white/5 text-xs font-black text-white hover:bg-white/10"
          >
            <Plus size={14} className="mr-2" />
            Agregar paso
          </Button>
          <Button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl bg-white text-xs font-black text-slate-950 hover:bg-slate-100"
          >
            Guardar vista
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Cerrar editor visual"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_430px]">
        <section className="relative min-h-[55vh] bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,.24),transparent_34%),#f8fafc] text-slate-950">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={workflowNodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            fitView
            minZoom={0.25}
            maxZoom={1.8}
            onNodeClick={(_, node) => {
              if (!String(node.id).startsWith("workflow-step-")) return;
              const index = Number(String(node.id).replace("workflow-step-", ""));
              if (Number.isFinite(index)) setSelectedStepIndex(index);
            }}
            fitViewOptions={{ padding: 0.18 }}
            attributionPosition="bottom-left"
          >
            <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-xl">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-indigo-600">
                <MousePointer2 size={14} />
                Lienzo interactivo
              </p>
              <p className="mt-1 max-w-sm text-[11px] font-semibold text-slate-500">
                Usa zoom y arrastre para recorrer el flujo. Las lineas punteadas son rutas por defecto.
              </p>
            </div>
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(node) => (node.id === COMPLETE_NODE_ID ? "#10b981" : "#4f46e5")}
              maskColor="rgba(15, 23, 42, 0.08)"
              pannable
              zoomable
            />
            <Background color="#cbd5e1" gap={22} />
          </ReactFlow>
        </section>

        <aside className="min-h-0 overflow-y-auto border-l border-white/10 bg-slate-950 p-4">
          {!selectedStep ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-slate-400">
              Selecciona un paso del workflow para editar sus decisiones.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">
                  Paso seleccionado
                </p>
                <input
                  value={selectedStep.label || ""}
                  onChange={(event) => updateStep(selectedStepIndex, { label: event.target.value })}
                  placeholder={`Paso ${selectedStepIndex + 1}`}
                  className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-white px-3 text-sm font-black text-slate-950 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/20"
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white/[0.05] p-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Variables</p>
                    <p className="mt-1 text-2xl font-black text-white">{selectedFields.length}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.05] p-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Rutas</p>
                    <p className="mt-1 text-2xl font-black text-white">{selectedRoutes.length}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">
                      Formulario del paso
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">
                      Estos campos son las variables que gobiernan las rutas.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setFormStepIndex(selectedStepIndex)}
                    className="h-9 shrink-0 rounded-xl bg-cyan-400 px-3 text-xs font-black text-slate-950 hover:bg-cyan-300"
                  >
                    <ClipboardList size={14} className="mr-2" />
                    {selectedStep.form ? "Editar" : "Crear"}
                  </Button>
                </div>

                <div className="mt-3 space-y-2">
                  {selectedFields.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/15 p-3 text-xs font-semibold text-slate-400">
                      Este paso aun no tiene formulario. Crea campos para usarlos como variables de decision.
                    </div>
                  ) : (
                    selectedFields.map((field: any) => (
                      <div key={field.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-slate-950">
                        <span className="truncate text-xs font-black">{field.label}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500">
                          {field.type}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200">
                  <Route size={14} />
                  Caminos del paso
                </p>
                <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Ruta si ninguna condicion coincide
                </label>
                <select
                  value={targetToSelectValue(selectedDefaultTarget, selectedStepIndex, steps.length)}
                  onChange={(event) =>
                    updateStep(selectedStepIndex, {
                      defaultNextStepIndex: selectValueToTarget(event.target.value),
                    })
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/20"
                >
                  {selectedTargetOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Condiciones
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => addRoute(selectedStepIndex)}
                    disabled={selectedFields.length === 0}
                    className="h-8 rounded-xl bg-indigo-500 px-3 text-[10px] font-black text-white hover:bg-indigo-400 disabled:opacity-40"
                  >
                    <Plus size={12} className="mr-1" />
                    Condicion
                  </Button>
                </div>

                <div className="mt-3 space-y-3">
                  {selectedRoutes.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/15 p-3 text-xs font-semibold text-slate-400">
                      Sin condiciones. El paso seguira la ruta por defecto.
                    </div>
                  )}

                  {selectedRoutes.map((route) => {
                    const needsValue = routeOperatorNeedsValue(route.operator);

                    return (
                      <div key={route.id} className="rounded-2xl border border-white/10 bg-slate-900 p-3">
                        <div className="grid grid-cols-1 gap-2">
                          <select
                            value={route.fieldId}
                            onChange={(event) => {
                              const field = selectedFields.find((candidate: any) => candidate.id === event.target.value);
                              updateRoute(selectedStepIndex, route.id, {
                                fieldId: event.target.value,
                                fieldLabel: field?.label || "",
                              });
                            }}
                            className="h-9 rounded-xl border border-white/10 bg-white px-3 text-xs font-bold text-slate-800 outline-none"
                          >
                            {selectedFields.map((field: any) => (
                              <option key={field.id} value={field.id}>
                                {field.label}
                              </option>
                            ))}
                          </select>
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={route.operator}
                              onChange={(event) =>
                                updateRoute(selectedStepIndex, route.id, {
                                  operator: event.target.value as WorkflowRouteOperator,
                                  value: routeOperatorNeedsValue(event.target.value) ? route.value || "" : "",
                                })
                              }
                              className="h-9 rounded-xl border border-white/10 bg-white px-3 text-xs font-bold text-slate-800 outline-none"
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
                                onChange={(event) => updateRoute(selectedStepIndex, route.id, { value: event.target.value })}
                                placeholder="Valor esperado"
                                className="h-9 rounded-xl border border-white/10 bg-white px-3 text-xs font-bold text-slate-800 outline-none"
                              />
                            ) : (
                              <div className="flex h-9 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-[10px] font-bold text-slate-400">
                                No requiere valor
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-[minmax(0,1fr)_38px] gap-2">
                            <select
                              value={targetToSelectValue(route.targetStepIndex, selectedStepIndex, steps.length)}
                              onChange={(event) =>
                                updateRoute(selectedStepIndex, route.id, {
                                  targetStepIndex: selectValueToTarget(event.target.value),
                                })
                              }
                              className="h-9 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-black text-indigo-800 outline-none"
                            >
                              {selectedTargetOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => removeRoute(selectedStepIndex, route.id)}
                              className="flex h-9 items-center justify-center rounded-xl border border-red-400/20 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                              title="Eliminar condicion"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {formStepIndex !== null && (
        <WorkflowStepFormBuilderModal
          isOpen={formStepIndex !== null}
          overlayClassName="z-[90]"
          onClose={() => setFormStepIndex(null)}
          stepName={steps[formStepIndex]?.label || `Paso ${formStepIndex + 1}`}
          initialForm={steps[formStepIndex]?.form}
          rateCards={rateCards}
          teamMembers={teamMembers}
          onSave={(form) => {
            if (formStepIndex === null) return;
            saveStepForm(formStepIndex, form);
          }}
        />
      )}
    </div>
  );
}
