"use client"

import React, { useEffect, useState } from "react";
import { Award, CheckCircle2, ClipboardCheck, Plus, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp } from "@/lib/supabase/document-store";
import { db } from "@/lib/backend";
import { toast } from "sonner";

type ProjectQualityProps = {
  projectId: string;
  teamMembers: any[];
  currentUser: any;
  canManage?: boolean;
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
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getMemberName = (teamMembers: any[], memberId?: string | null) =>
  teamMembers.find((member) => member.id === memberId)?.name || "Sin asignar";

const getQualityGrade = (score: number) => {
  if (score >= 90) return { label: "Excelente", className: "bg-emerald-50 text-emerald-700" };
  if (score >= 75) return { label: "Bueno", className: "bg-indigo-50 text-indigo-700" };
  if (score >= 60) return { label: "En mejora", className: "bg-amber-50 text-amber-700" };
  return { label: "Crítico", className: "bg-red-50 text-red-700" };
};

export function ProjectQuality({ projectId, teamMembers, currentUser, canManage = true }: ProjectQualityProps) {
  const [causes, setCauses] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [newCauseName, setNewCauseName] = useState("");
  const [isSavingCause, setIsSavingCause] = useState(false);

  useEffect(() => {
    const causesQuery = query(collection(db, "projects", projectId, "qualityCauses"));
    const unsubscribeCauses = onSnapshot(causesQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      data.sort((left: any, right: any) => String(left.name || "").localeCompare(String(right.name || "")));
      setCauses(data);
    });

    const eventsQuery = query(collection(db, "projects", projectId, "qualityEvents"));
    const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      data.sort((left: any, right: any) => {
        const rightTime = right.createdAt?.toMillis?.() || Date.parse(right.createdAt || "") || 0;
        const leftTime = left.createdAt?.toMillis?.() || Date.parse(left.createdAt || "") || 0;
        return rightTime - leftTime;
      });
      setEvents(data);
    });

    return () => {
      unsubscribeCauses();
      unsubscribeEvents();
    };
  }, [projectId]);

  const handleCreateCause = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newCauseName.trim();
    if (!name) {
      toast.warning("Ingresa el nombre de la causal.");
      return;
    }

    setIsSavingCause(true);
    try {
      await addDoc(collection(db, "projects", projectId, "qualityCauses"), {
        projectId,
        name,
        active: true,
        createdAt: serverTimestamp(),
        createdBy: currentUser?.uid || null,
      });
      setNewCauseName("");
      toast.success("Causal de calidad creada.");
    } catch (error: any) {
      console.error("Error creating quality cause:", error);
      toast.error(error?.message || "No se pudo crear la causal.");
    } finally {
      setIsSavingCause(false);
    }
  };

  const handleDeleteCause = async (causeId: string) => {
    try {
      await deleteDoc(doc(db, "projects", projectId, "qualityCauses", causeId));
      toast.success("Causal eliminada.");
    } catch (error: any) {
      console.error("Error deleting quality cause:", error);
      toast.error(error?.message || "No se pudo eliminar la causal.");
    }
  };

  const acceptedEvents = events.filter((event) => event.result === "accepted");
  const rejectedEvents = events.filter((event) => event.result === "rejected");
  const qualityScore = events.length > 0 ? Math.round((acceptedEvents.length / events.length) * 100) : 0;

  const professionalRows = Object.values(events.reduce((acc: Record<string, any>, event) => {
    const professionalId = event.professionalId || "unknown";
    if (!acc[professionalId]) {
      acc[professionalId] = {
        id: professionalId,
        name: getMemberName(teamMembers, professionalId),
        accepted: 0,
        rejected: 0,
        reviewed: 0,
      };
    }
    acc[professionalId].reviewed += 1;
    if (event.result === "accepted") acc[professionalId].accepted += 1;
    if (event.result === "rejected") acc[professionalId].rejected += 1;
    return acc;
  }, {})).map((row: any) => ({
    ...row,
    score: row.reviewed > 0 ? Math.round((row.accepted / row.reviewed) * 100) : 0,
  })).sort((left: any, right: any) => right.score - left.score || right.reviewed - left.reviewed);

  const reviewerRows = Object.values(events.reduce((acc: Record<string, any>, event) => {
    const reviewerId = event.reviewerId || event.createdBy || "unknown";
    if (!acc[reviewerId]) {
      acc[reviewerId] = {
        id: reviewerId,
        name: getMemberName(teamMembers, reviewerId),
        accepted: 0,
        rejected: 0,
        reviewed: 0,
      };
    }
    acc[reviewerId].reviewed += 1;
    if (event.result === "accepted") acc[reviewerId].accepted += 1;
    if (event.result === "rejected") acc[reviewerId].rejected += 1;
    return acc;
  }, {})).sort((left: any, right: any) => right.reviewed - left.reviewed);

  const causeRows = Object.values(rejectedEvents.reduce((acc: Record<string, any>, event) => {
    const causeId = event.causeId || "unknown";
    if (!acc[causeId]) {
      acc[causeId] = {
        id: causeId,
        name: event.causeLabel || "Sin causal",
        count: 0,
      };
    }
    acc[causeId].count += 1;
    return acc;
  }, {})).sort((left: any, right: any) => right.count - left.count);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck size={20} className="text-indigo-500" />
            Gestión de calidad
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Parametriza causales, mide aprobaciones y devoluciones del proyecto.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Revisiones</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{events.length}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-100 bg-emerald-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Aceptadas</p>
            <p className="mt-1 text-3xl font-bold text-emerald-700">{acceptedEvents.length}</p>
          </CardContent>
        </Card>
        <Card className="border-red-100 bg-red-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-red-700">Devueltas</p>
            <p className="mt-1 text-3xl font-bold text-red-700">{rejectedEvents.length}</p>
          </CardContent>
        </Card>
        <Card className="border-indigo-100 bg-indigo-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Score calidad</p>
            <p className="mt-1 text-3xl font-bold text-indigo-700">{qualityScore}%</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck size={17} className="text-indigo-500" />
            Causales de devolución
          </CardTitle>
          <CardDescription>
            Estas causales se solicitan cuando un paso de control de calidad devuelve un workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManage && (
            <form onSubmit={handleCreateCause} className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={newCauseName}
                onChange={(event) => setNewCauseName(event.target.value)}
                placeholder="Ej. Inconsistencia en entregable"
                className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <Button type="submit" disabled={isSavingCause || !newCauseName.trim()} className="bg-indigo-600 text-white hover:bg-indigo-700">
                <Plus size={15} className="mr-2" />
                Agregar
              </Button>
            </form>
          )}

          <div className="flex flex-wrap gap-2">
            {causes.map((cause) => (
              <span key={cause.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {cause.name}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCause(cause.id)}
                    className="text-slate-400 transition-colors hover:text-red-600"
                    aria-label={`Eliminar ${cause.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </span>
            ))}
            {causes.length === 0 && (
              <p className="text-sm text-slate-500">No hay causales configuradas.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award size={17} className="text-indigo-500" />
              Ranking de profesionales
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                  <TableHead>Profesional</TableHead>
                  <TableHead>Aciertos</TableHead>
                  <TableHead>Fallas</TableHead>
                  <TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {professionalRows.map((row: any) => {
                  const grade = getQualityGrade(row.score);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
                      <TableCell className="text-emerald-700">{row.accepted}</TableCell>
                      <TableCell className="text-red-600">{row.rejected}</TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${grade.className}`}>
                          {row.score}% · {grade.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {professionalRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-slate-500">
                      Aún no hay revisiones de calidad.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 size={17} className="text-indigo-500" />
              Revisores de calidad
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                  <TableHead>Revisor</TableHead>
                  <TableHead>Revisadas</TableHead>
                  <TableHead>Aceptadas</TableHead>
                  <TableHead>Devueltas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewerRows.map((row: any) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
                    <TableCell>{row.reviewed}</TableCell>
                    <TableCell className="text-emerald-700">{row.accepted}</TableCell>
                    <TableCell className="text-red-600">{row.rejected}</TableCell>
                  </TableRow>
                ))}
                {reviewerRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-slate-500">
                      Aún no hay revisores con actividad.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Historial de calidad</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tarea</TableHead>
                  <TableHead>Profesional</TableHead>
                  <TableHead>Revisor</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Causal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.slice(0, 50).map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-slate-600">{formatDate(event.createdAt)}</TableCell>
                    <TableCell className="max-w-[260px] truncate font-medium text-slate-900" title={event.taskTitle || ""}>
                      {event.taskTitle || "Sin tarea"}
                    </TableCell>
                    <TableCell>{getMemberName(teamMembers, event.professionalId)}</TableCell>
                    <TableCell>{getMemberName(teamMembers, event.reviewerId)}</TableCell>
                    <TableCell>
                      {event.result === "accepted" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                          <CheckCircle2 size={12} />
                          Aceptada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
                          <XCircle size={12} />
                          Devuelta
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600">{event.causeLabel || "-"}</TableCell>
                  </TableRow>
                ))}
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">
                      No hay eventos de calidad registrados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Causales más frecuentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {causeRows.map((cause: any) => (
              <div key={cause.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-slate-700">{cause.name}</span>
                  <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700">{cause.count}</span>
                </div>
              </div>
            ))}
            {causeRows.length === 0 && (
              <p className="text-sm text-slate-500">Sin devoluciones clasificadas.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
