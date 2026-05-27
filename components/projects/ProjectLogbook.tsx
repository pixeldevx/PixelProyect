"use client"

import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, increment, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "@/lib/supabase/document-store";
import { db } from "@/lib/backend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, CheckCircle2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

type ProjectLogbookProps = {
  projectId: string;
  project: any;
  tasks: any[];
  teamMembers: any[];
  currentUser: any;
  canCreateTasks: boolean;
  canAddSubtasks: boolean;
};

type ActionCandidate = {
  id: string;
  text: string;
  verb: string;
  status?: "open" | "linked" | "ignored";
  linkedTaskId?: string | null;
  linkedTaskTitle?: string | null;
  relationType?: string | null;
};

type LogbookEntry = {
  id: string;
  title: string;
  content: string;
  type: string;
  actionCandidates?: ActionCandidate[];
  derivedLinks?: any[];
  createdAt?: any;
  createdBy?: string | null;
  createdByEmail?: string | null;
};

type ActionForm = {
  relationType: "task" | "subtask" | "workflow" | "comment";
  title: string;
  assignedTo: string;
  parentTaskId: string;
  targetTaskId: string;
  startDate: string;
  endDate: string;
  priority: "low" | "medium" | "high";
  comment: string;
};

const ENTRY_TYPES = [
  { value: "meeting", label: "Reunión" },
  { value: "decision", label: "Decisión" },
  { value: "problem", label: "Problema" },
  { value: "quality", label: "Calidad" },
  { value: "client", label: "Cliente" },
  { value: "internal", label: "Interno" },
];

const ACTION_VERBS = [
  "hacer",
  "revisar",
  "corregir",
  "validar",
  "aprobar",
  "entregar",
  "enviar",
  "coordinar",
  "documentar",
  "ajustar",
  "verificar",
  "levantar",
  "programar",
  "medir",
  "calificar",
  "crear",
  "actualizar",
  "definir",
  "resolver",
  "analizar",
  "confirmar",
  "preparar",
  "cargar",
  "responder",
  "completar",
  "gestionar",
  "calidad",
];

const foldText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

const candidateIdFor = (text: string, index: number, verb: string) =>
  `${index}-${verb}-${foldText(text).replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`;

const detectActionCandidates = (content: string): ActionCandidate[] => {
  const segments = content
    .split(/(?<=[.!?])\s+|\n+/)
    .map(normalizeWhitespace)
    .filter((segment) => segment.length >= 8);

  return segments.reduce<ActionCandidate[]>((candidates, segment, index) => {
    const foldedSegment = foldText(segment);
    const verb = ACTION_VERBS.find((candidateVerb) => {
      const foldedVerb = foldText(candidateVerb);
      return new RegExp(`(^|[^a-z0-9])${foldedVerb}([^a-z0-9]|$)`, "i").test(foldedSegment);
    });

    if (!verb) return candidates;

    candidates.push({
      id: candidateIdFor(segment, index, verb),
      text: segment,
      verb,
      status: "open",
    });
    return candidates;
  }, []);
};

const getDateValue = (value: any) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value: any) => {
  const date = getDateValue(value);
  if (!date) return "Sin fecha";
  return date.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const toDateInputValue = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getTaskTitle = (task: any) => task?.title || task?.name || "Tarea";

const getStatusLabel = (status: string) => {
  switch (status) {
    case "completed":
      return "Finalizada";
    case "completed_late":
      return "Finalizada con retraso";
    case "in_progress":
      return "Trabajando";
    case "stuck":
      return "Estancada";
    case "pending":
    case "todo":
      return "Pendiente";
    default:
      return status || "Pendiente";
  }
};

const getStatusClass = (status: string) => {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case "completed_late":
      return "bg-orange-50 text-orange-700 border-orange-100";
    case "in_progress":
      return "bg-amber-50 text-amber-700 border-amber-100";
    case "stuck":
      return "bg-red-50 text-red-700 border-red-100";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
};

const emptyActionForm = (defaultAssignee = ""): ActionForm => ({
  relationType: "task",
  title: "",
  assignedTo: defaultAssignee,
  parentTaskId: "",
  targetTaskId: "",
  startDate: toDateInputValue(new Date()),
  endDate: toDateInputValue(addDays(new Date(), 7)),
  priority: "medium",
  comment: "",
});

export function ProjectLogbook({
  projectId,
  project,
  tasks,
  teamMembers,
  currentUser,
  canCreateTasks,
  canAddSubtasks,
}: ProjectLogbookProps) {
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("meeting");
  const [savingEntry, setSavingEntry] = useState(false);
  const [selectedAction, setSelectedAction] = useState<{ entry: LogbookEntry; candidate: ActionCandidate } | null>(null);
  const [actionForm, setActionForm] = useState<ActionForm>(emptyActionForm());
  const [savingAction, setSavingAction] = useState(false);

  const projectMemberIds = useMemo(
    () => new Set((project?.assignedTeamMembers || []).filter(Boolean)),
    [project?.assignedTeamMembers]
  );

  const projectMembers = useMemo(
    () => teamMembers.filter((member) => projectMemberIds.has(member.id)),
    [projectMemberIds, teamMembers]
  );

  const viewerMember = useMemo(() => {
    const email = currentUser?.email?.toLowerCase();
    return teamMembers.find((member) =>
      member.id === currentUser?.uid ||
      member.authUserId === currentUser?.uid ||
      (email && member.email?.toLowerCase() === email)
    );
  }, [currentUser?.email, currentUser?.uid, teamMembers]);

  const defaultAssignee = viewerMember?.id || projectMembers[0]?.id || "";
  const parentTaskOptions = tasks.filter((task) => !task.parentTaskId);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  useEffect(() => {
    if (!projectId) return;

    const entriesQuery = query(
      collection(db, "projects", projectId, "logbookEntries"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      entriesQuery,
      (snapshot) => {
        setEntries(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as LogbookEntry)));
        setLoading(false);
      },
      (error) => {
        console.error("Error loading project logbook:", error);
        toast.error("No se pudo cargar la bitácora.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [projectId]);

  const resetEntryForm = () => {
    setTitle("");
    setContent("");
    setType("meeting");
  };

  const handleCreateEntry = async (event: React.FormEvent) => {
    event.preventDefault();

    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (!cleanTitle || !cleanContent) {
      toast.warning("Agrega título y contenido para la bitácora.");
      return;
    }

    setSavingEntry(true);
    try {
      await addDoc(collection(db, "projects", projectId, "logbookEntries"), {
        projectId,
        title: cleanTitle,
        content: cleanContent,
        type,
        actionCandidates: detectActionCandidates(cleanContent),
        derivedLinks: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser?.uid || null,
        createdByEmail: currentUser?.email || null,
      });
      resetEntryForm();
      toast.success("Entrada de bitácora creada.");
    } catch (error: any) {
      console.error("Error creating logbook entry:", error);
      toast.error(error?.message || "No se pudo guardar la bitácora.");
    } finally {
      setSavingEntry(false);
    }
  };

  const openActionModal = (entry: LogbookEntry, candidate: ActionCandidate) => {
    if (candidate.status === "ignored") return;
    setSelectedAction({ entry, candidate });
    setActionForm({
      ...emptyActionForm(defaultAssignee),
      title: candidate.text,
      comment: `Acción detectada en bitácora: ${candidate.text}`,
    });
  };

  const updateCandidateLink = async (entry: LogbookEntry, candidate: ActionCandidate, link: any) => {
    const currentCandidates = entry.actionCandidates?.length
      ? entry.actionCandidates
      : detectActionCandidates(entry.content || "");
    const nextCandidates = currentCandidates.map((item) =>
      item.id === candidate.id
        ? {
            ...item,
            status: link.relationType === "ignored" ? "ignored" : "linked",
            linkedTaskId: link.taskId || null,
            linkedTaskTitle: link.taskTitle || null,
            relationType: link.relationType,
          }
        : item
    );

    const nextLinks = link.relationType === "ignored"
      ? entry.derivedLinks || []
      : [...(entry.derivedLinks || []), link];

    await updateDoc(doc(db, "projects", projectId, "logbookEntries", entry.id), {
      actionCandidates: nextCandidates,
      derivedLinks: nextLinks,
      updatedAt: serverTimestamp(),
    });
  };

  const handleIgnoreCandidate = async (entry: LogbookEntry, candidate: ActionCandidate) => {
    try {
      await updateCandidateLink(entry, candidate, {
        relationType: "ignored",
        candidateId: candidate.id,
      });
      toast.success("Acción ignorada.");
    } catch (error: any) {
      console.error("Error ignoring logbook candidate:", error);
      toast.error(error?.message || "No se pudo actualizar la bitácora.");
    }
  };

  const handleMaterializeAction = async () => {
    if (!selectedAction) return;

    const cleanTitle = actionForm.title.trim();
    if (!cleanTitle) {
      toast.warning("Define el nombre de la tarea o comentario.");
      return;
    }

    if ((actionForm.relationType === "task" || actionForm.relationType === "workflow") && !canCreateTasks) {
      toast.error("No tienes permisos para crear tareas.");
      return;
    }

    if (actionForm.relationType === "subtask") {
      if (!canAddSubtasks) {
        toast.error("No tienes permisos para crear subtareas.");
        return;
      }
      if (!actionForm.parentTaskId) {
        toast.warning("Selecciona la tarea padre.");
        return;
      }
    }

    if (actionForm.relationType === "comment" && !actionForm.targetTaskId) {
      toast.warning("Selecciona la tarea donde se agregará el comentario.");
      return;
    }

    const startDate = new Date(`${actionForm.startDate}T00:00:00`);
    const endDate = new Date(`${actionForm.endDate}T00:00:00`);
    if (actionForm.relationType !== "comment" && (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))) {
      toast.warning("Define fechas válidas.");
      return;
    }

    setSavingAction(true);
    try {
      const { entry, candidate } = selectedAction;
      let link: any = {
        candidateId: candidate.id,
        candidateText: candidate.text,
        relationType: actionForm.relationType,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.uid || null,
      };

      if (actionForm.relationType === "comment") {
        const targetTask = tasksById.get(actionForm.targetTaskId);
        await addDoc(collection(db, "projects", projectId, "tasks", actionForm.targetTaskId, "comments"), {
          projectId,
          taskId: actionForm.targetTaskId,
          text: actionForm.comment.trim() || cleanTitle,
          source: "logbook",
          logbookEntryId: entry.id,
          logbookEntryTitle: entry.title,
          logbookCandidateId: candidate.id,
          logbookCandidateText: candidate.text,
          createdAt: serverTimestamp(),
          createdBy: currentUser?.uid || null,
          createdByEmail: currentUser?.email || null,
        });
        await updateDoc(doc(db, "projects", projectId, "tasks", actionForm.targetTaskId), {
          commentCount: increment(1),
          updatedAt: serverTimestamp(),
        });
        link = {
          ...link,
          taskId: actionForm.targetTaskId,
          taskTitle: getTaskTitle(targetTask),
        };
      } else {
        const isWorkflow = actionForm.relationType === "workflow";
        const parentTask = actionForm.parentTaskId ? tasksById.get(actionForm.parentTaskId) : null;
        const taskData: any = {
          projectId,
          title: cleanTitle,
          name: cleanTitle,
          description: `Derivada de bitácora: ${candidate.text}`,
          startDate,
          endDate,
          start: startDate,
          end: endDate,
          assignedTo: actionForm.assignedTo || parentTask?.assignedTo || "",
          indicator: null,
          indicatorValue: null,
          status: actionForm.relationType === "subtask" ? "todo" : "pending",
          progress: 0,
          type: isWorkflow ? "workflow" : "state",
          requiresDocument: false,
          linkedDocumentId: null,
          isRateCardTask: false,
          rateCardId: null,
          unitsToAdd: null,
          syncExternal: false,
          priority: actionForm.priority,
          currentValue: 0,
          parentTaskId: actionForm.relationType === "subtask" ? actionForm.parentTaskId : null,
          originLogbook: {
            entryId: entry.id,
            entryTitle: entry.title,
            entryType: entry.type,
            candidateId: candidate.id,
            candidateText: candidate.text,
          },
          displayOrder: tasks.length + 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: currentUser?.uid || null,
        };

        if (isWorkflow) {
          taskData.workflowSteps = [
            {
              label: "Ejecutar acción",
              assignedTo: actionForm.assignedTo || "",
              status: "not_started",
            },
            {
              label: "Verificar resultado",
              assignedTo: actionForm.assignedTo || "",
              status: "not_started",
            },
          ];
          taskData.currentStepIndex = 0;
          taskData.workflowHistory = [];
        }

        const taskRef = await addDoc(collection(db, "projects", projectId, "tasks"), taskData);
        link = {
          ...link,
          taskId: taskRef.id,
          taskTitle: cleanTitle,
        };
      }

      await updateCandidateLink(entry, candidate, link);
      setSelectedAction(null);
      toast.success("Bitácora conectada con la planificación.");
    } catch (error: any) {
      console.error("Error materializing logbook action:", error);
      toast.error(error?.message || "No se pudo crear la acción desde bitácora.");
    } finally {
      setSavingAction(false);
    }
  };

  const renderAnnotatedContent = (entry: LogbookEntry) => {
    const candidates = (entry.actionCandidates?.length ? entry.actionCandidates : detectActionCandidates(entry.content || ""))
      .filter((candidate) => candidate.status !== "ignored")
      .map((candidate) => ({
        ...candidate,
        index: (entry.content || "").indexOf(candidate.text),
      }))
      .filter((candidate) => candidate.index >= 0)
      .sort((left, right) => left.index - right.index);

    if (candidates.length === 0) return entry.content;

    const nodes: React.ReactNode[] = [];
    let cursor = 0;

    candidates.forEach((candidate) => {
      if (candidate.index < cursor) return;
      if (candidate.index > cursor) {
        nodes.push(entry.content.slice(cursor, candidate.index));
      }
      nodes.push(
        <button
          key={candidate.id}
          type="button"
          onClick={() => openActionModal(entry, candidate)}
          className={`inline rounded px-0.5 text-left underline decoration-2 underline-offset-4 transition-colors ${
            candidate.status === "linked"
              ? "decoration-emerald-400 hover:bg-emerald-50"
              : "decoration-indigo-400 hover:bg-indigo-50"
          }`}
          title={candidate.status === "linked" ? "Acción vinculada" : "Convertir en tarea"}
        >
          {candidate.text}
        </button>
      );
      cursor = candidate.index + candidate.text.length;
    });

    if (cursor < entry.content.length) nodes.push(entry.content.slice(cursor));
    return nodes;
  };

  const actionCandidateCount = entries.reduce(
    (total, entry) => total + (entry.actionCandidates || []).filter((candidate) => candidate.status !== "ignored").length,
    0
  );
  const linkedActionCount = entries.reduce(
    (total, entry) => total + (entry.derivedLinks || []).length,
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <BookOpen size={20} className="text-indigo-500" />
            Bitácora del proyecto
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Convierte reuniones, decisiones y problemas en tareas trazables.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="bg-indigo-50 text-indigo-700">
            {entries.length} entradas
          </Badge>
          <Badge variant="secondary" className="bg-amber-50 text-amber-700">
            {actionCandidateCount} acciones detectadas
          </Badge>
          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
            {linkedActionCount} vínculos
          </Badge>
        </div>
      </div>

      <form onSubmit={handleCreateEntry} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Título de la entrada"
            className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          >
            {ENTRY_TYPES.map((entryType) => (
              <option key={entryType.value} value={entryType.value}>
                {entryType.label}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Pega la minuta o escribe lo ocurrido. Las frases accionables se detectarán al guardar."
          className="mt-3 min-h-32 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Sparkles size={14} className="text-indigo-500" />
            Detecta verbos como revisar, corregir, validar, entregar, coordinar y calidad.
          </div>
          <Button type="submit" disabled={savingEntry || !title.trim() || !content.trim()} className="bg-indigo-600 text-white hover:bg-indigo-700">
            {savingEntry ? "Guardando..." : "Guardar entrada"}
          </Button>
        </div>
      </form>

      <div className="space-y-4">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            Cargando bitácora...
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
            <BookOpen className="mx-auto mb-3 text-slate-300" size={32} />
            <p className="text-sm font-semibold text-slate-700">Aún no hay historia registrada.</p>
            <p className="mt-1 text-sm text-slate-500">La primera entrada puede salir de una reunión, decisión o problema del proyecto.</p>
          </div>
        ) : (
          entries.map((entry) => {
            const candidates = (entry.actionCandidates || []).filter((candidate) => candidate.status !== "ignored");
            const links = entry.derivedLinks || [];

            return (
              <article key={entry.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                        {ENTRY_TYPES.find((entryType) => entryType.value === entry.type)?.label || entry.type}
                      </Badge>
                      <span className="text-xs text-slate-400">{formatDate(entry.createdAt)}</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">{entry.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">{entry.createdByEmail || "Usuario"}</p>
                  </div>
                  <div className="flex shrink-0 gap-2 text-xs">
                    <span className="rounded-full bg-amber-50 px-2 py-1 font-bold text-amber-700">
                      {candidates.length} acciones
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-700">
                      {links.length} vinculadas
                    </span>
                  </div>
                </div>

                <div className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-sm leading-7 text-slate-700">
                  {renderAnnotatedContent(entry)}
                </div>

                {candidates.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Acciones detectadas</p>
                    <div className="flex flex-wrap gap-2">
                      {candidates.map((candidate) => (
                        <div key={candidate.id} className="inline-flex max-w-full items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs text-indigo-700">
                          <button
                            type="button"
                            onClick={() => openActionModal(entry, candidate)}
                            className="max-w-[420px] truncate font-semibold"
                            title={candidate.text}
                          >
                            {candidate.verb}: {candidate.text}
                          </button>
                          {candidate.status === "linked" ? (
                            <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleIgnoreCandidate(entry, candidate)}
                              className="shrink-0 text-indigo-300 hover:text-red-500"
                              aria-label="Ignorar acción"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {links.length > 0 && (
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {links.map((link: any, index: number) => {
                      const linkedTask = tasksById.get(link.taskId);
                      const status = linkedTask?.status || "missing";
                      return (
                        <div key={`${entry.id}-link-${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800">{link.taskTitle || "Tarea vinculada"}</p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {link.relationType === "workflow" ? "Workflow" : link.relationType === "subtask" ? "Subtarea" : link.relationType === "comment" ? "Comentario" : "Tarea"}
                              </p>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${getStatusClass(status)}`}>
                              {linkedTask ? getStatusLabel(status) : "Sin tarea"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {selectedAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Materializar acción</h3>
                <p className="mt-1 text-sm text-slate-500">Conecta esta frase con la planificación del proyecto.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAction(null)}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-5">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-800">
                {selectedAction.candidate.text}
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Convertir en</label>
                <select
                  value={actionForm.relationType}
                  onChange={(event) => setActionForm((current) => ({ ...current, relationType: event.target.value as ActionForm["relationType"] }))}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="task">Tarea</option>
                  <option value="subtask">Subtarea</option>
                  <option value="workflow">Workflow simple</option>
                  <option value="comment">Comentario en tarea existente</option>
                </select>
              </div>

              {actionForm.relationType === "comment" ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Tarea destino</label>
                    <select
                      value={actionForm.targetTaskId}
                      onChange={(event) => setActionForm((current) => ({ ...current, targetTaskId: event.target.value }))}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">Seleccionar tarea...</option>
                      {tasks.map((task) => (
                        <option key={task.id} value={task.id}>{getTaskTitle(task)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Comentario</label>
                    <textarea
                      value={actionForm.comment}
                      onChange={(event) => setActionForm((current) => ({ ...current, comment: event.target.value }))}
                      className="min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Nombre</label>
                    <input
                      value={actionForm.title}
                      onChange={(event) => setActionForm((current) => ({ ...current, title: event.target.value }))}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  {actionForm.relationType === "subtask" && (
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Tarea padre</label>
                      <select
                        value={actionForm.parentTaskId}
                        onChange={(event) => setActionForm((current) => ({ ...current, parentTaskId: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="">Seleccionar tarea padre...</option>
                        {parentTaskOptions.map((task) => (
                          <option key={task.id} value={task.id}>{getTaskTitle(task)}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Responsable</label>
                      <select
                        value={actionForm.assignedTo}
                        onChange={(event) => setActionForm((current) => ({ ...current, assignedTo: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="">Sin asignar</option>
                        {projectMembers.map((member) => (
                          <option key={member.id} value={member.id}>{member.name || member.email}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Prioridad</label>
                      <select
                        value={actionForm.priority}
                        onChange={(event) => setActionForm((current) => ({ ...current, priority: event.target.value as ActionForm["priority"] }))}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="low">Baja</option>
                        <option value="medium">Media</option>
                        <option value="high">Alta</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Inicio</label>
                      <input
                        type="date"
                        value={actionForm.startDate}
                        onChange={(event) => setActionForm((current) => ({ ...current, startDate: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Fin</label>
                      <input
                        type="date"
                        value={actionForm.endDate}
                        onChange={(event) => setActionForm((current) => ({ ...current, endDate: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 p-5">
              <Button type="button" variant="outline" onClick={() => setSelectedAction(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleMaterializeAction} disabled={savingAction} className="bg-indigo-600 text-white hover:bg-indigo-700">
                {savingAction ? "Guardando..." : "Crear vínculo"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
