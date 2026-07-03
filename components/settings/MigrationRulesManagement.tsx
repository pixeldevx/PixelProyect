"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Layers3,
  RotateCcw,
  Route,
  Save,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { doc, onSnapshot, serverTimestamp, setDoc } from "@/lib/supabase/document-store";
import { db } from "@/lib/backend";
import {
  DEFAULT_MIGRATION_RULES,
  MigrationRule,
  MigrationRuleSeverity,
  MigrationUnitRecord,
  normalizeMigrationRules,
  shouldValidateUnitInsideTerrain,
} from "@/lib/migration-rules";

interface MigrationRulesManagementProps {
  currentUser: any;
}

const severityStyles: Record<MigrationRuleSeverity, string> = {
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-orange-200 bg-orange-50 text-orange-700",
  blocking: "border-red-200 bg-red-50 text-red-700",
};

const stageLabel = {
  migration: "Migracion inicial",
  procedure: "Tramites",
};

const modeLabel = {
  spatial: "Espacial",
  attribute: "Atributos",
  business: "Negocio",
};

const sampleUnits: MigrationUnitRecord[] = [
  {
    id: "UN-101",
    label: "Unidad 101",
    floor: 1,
    migrationAttributes: {
      piso: 1,
      uso: "Comercial",
      matricula: "000-101",
      estado_migracion: "Requiere ajuste",
    },
  },
  {
    id: "UN-201",
    label: "Unidad 201",
    floor: 2,
    migrationAttributes: {
      piso: 2,
      uso: "Residencial",
      matricula: "000-201",
      estado_migracion: "Exenta por piso superior",
    },
  },
  {
    id: "UN-301",
    label: "Unidad 301",
    floor: 3,
    migrationAttributes: {
      piso: 3,
      uso: "Residencial",
      matricula: "000-301",
      estado_migracion: "Exenta por piso superior",
    },
  },
];

const groupUnitsByFloor = (units: MigrationUnitRecord[]) =>
  units.reduce<Record<string, MigrationUnitRecord[]>>((groups, unit) => {
    const key = String(unit.floor || unit.migrationAttributes?.piso || unit.attributes?.piso || "Sin piso");
    groups[key] = [...(groups[key] || []), unit];
    return groups;
  }, {});

export function MigrationRulesManagement({ currentUser }: MigrationRulesManagementProps) {
  const [rules, setRules] = useState<MigrationRule[]>(() => normalizeMigrationRules(DEFAULT_MIGRATION_RULES));
  const [savedRules, setSavedRules] = useState<MigrationRule[]>(() => normalizeMigrationRules(DEFAULT_MIGRATION_RULES));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeRuleId, setActiveRuleId] = useState("unit-inside-terrain-first-floor");
  const [units, setUnits] = useState<MigrationUnitRecord[]>(sampleUnits);
  const [selectedUnitId, setSelectedUnitId] = useState(sampleUnits[0].id);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "settings", "migrationRules"),
      (snapshot) => {
        const normalized = normalizeMigrationRules(snapshot.exists() ? snapshot.data() : null);
        setRules(normalized);
        setSavedRules(normalized);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading migration rules:", error);
        toast.error("No se pudieron cargar las reglas.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const activeRule = rules.find((rule) => rule.id === activeRuleId) || rules[0];
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) || units[0];
  const groupedUnits = useMemo(() => groupUnitsByFloor(units), [units]);
  const hasChanges = useMemo(() => JSON.stringify(rules) !== JSON.stringify(savedRules), [rules, savedRules]);

  const updateRule = (ruleId: string, patch: Partial<MigrationRule>) => {
    setRules((current) => current.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));
  };

  const updateRuleSetting = (ruleId: string, settingKey: string, value: unknown) => {
    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              settings: {
                ...rule.settings,
                [settingKey]: value,
              },
            }
          : rule
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, "settings", "migrationRules"),
        {
          rules,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.uid || null,
        },
        { merge: true }
      );
      setSavedRules(rules);
      toast.success("Reglas administrativas actualizadas.");
    } catch (error: any) {
      console.error("Error saving migration rules:", error);
      toast.error(error?.message || "No se pudieron guardar las reglas.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setRules(normalizeMigrationRules(DEFAULT_MIGRATION_RULES));
  };

  const updateSelectedUnitAttribute = (key: string, value: string) => {
    setUnits((current) =>
      current.map((unit) =>
        unit.id === selectedUnit.id
          ? {
              ...unit,
              floor: key === "piso" ? value : unit.floor,
              migrationAttributes: {
                ...(unit.migrationAttributes || {}),
                [key]: value,
              },
            }
          : unit
      )
    );
  };

  const firstFloorApplies = shouldValidateUnitInsideTerrain(selectedUnit, activeRule);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black uppercase tracking-[0.24em] text-indigo-600">
              <Route size={14} />
              Motor administrativo de reglas
            </p>
            <h2 className="mt-3 text-2xl font-black text-slate-950">Reglas de migracion y tramites</h2>
            <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
              Define que validaciones se aplican durante la migracion inicial y durante los tramites. Estas reglas quedan
              centralizadas para que el saneamiento no dependa de condiciones escondidas en la interfaz.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={handleReset} disabled={loading || saving}>
              <RotateCcw size={16} className="mr-2" />
              Restaurar base
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={loading || saving || !hasChanges}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Save size={16} className="mr-2" />
              {saving ? "Guardando..." : "Guardar reglas"}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500">
          Cargando reglas administrativas...
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <div className="space-y-3">
            {rules.map((rule) => (
              <button
                key={rule.id}
                type="button"
                onClick={() => setActiveRuleId(rule.id)}
                className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                  activeRuleId === rule.id
                    ? "border-indigo-300 bg-indigo-50/70 ring-2 ring-indigo-100"
                    : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
                        {rule.code}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${severityStyles[rule.severity]}`}>
                        {rule.severity}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-black text-slate-950">{rule.name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-500">{rule.description}</p>
                  </div>
                  {rule.enabled ? (
                    <CheckCircle2 size={20} className="shrink-0 text-emerald-500" />
                  ) : (
                    <AlertTriangle size={20} className="shrink-0 text-slate-300" />
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.14em]">
                  <span className="rounded-lg bg-white px-2 py-1 text-slate-500">{stageLabel[rule.scope]}</span>
                  <span className="rounded-lg bg-white px-2 py-1 text-slate-500">{modeLabel[rule.mode]}</span>
                  <span className="rounded-lg bg-white px-2 py-1 text-slate-500">{rule.appliesTo}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-indigo-500">Regla seleccionada</p>
                  <h3 className="mt-2 text-xl font-black text-slate-950">{activeRule.name}</h3>
                  <p className="mt-1 text-sm font-medium text-slate-500">{activeRule.description}</p>
                </div>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                  Activa
                  <Switch checked={activeRule.enabled} onCheckedChange={(checked) => updateRule(activeRule.id, { enabled: Boolean(checked) })} />
                </label>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Etapa</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{stageLabel[activeRule.scope]}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Tipo</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{modeLabel[activeRule.mode]}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Severidad</p>
                  <select
                    value={activeRule.severity}
                    onChange={(event) => updateRule(activeRule.id, { severity: event.target.value as MigrationRuleSeverity })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400"
                  >
                    <option value="warning">Advertencia</option>
                    <option value="error">Error</option>
                    <option value="blocking">Bloqueante</option>
                  </select>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-1 shrink-0 text-indigo-500" size={20} />
                  <div>
                    <p className="text-sm font-black text-slate-900">Condicion de aplicacion</p>
                    <p className="mt-1 text-sm font-medium text-slate-600">{activeRule.conditionSummary}</p>
                  </div>
                </div>
                {activeRule.id === "unit-inside-terrain-first-floor" && (
                  <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-white px-4 py-3 text-sm font-bold text-slate-700">
                    Aplicar solo a unidades en primera planta
                    <Switch
                      checked={Boolean(activeRule.settings.appliesOnlyToFirstFloor)}
                      onCheckedChange={(checked) => updateRuleSetting(activeRule.id, "appliesOnlyToFirstFloor", Boolean(checked))}
                    />
                  </label>
                )}
              </div>
            </div>

            {activeRule.id === "unit-inside-terrain-first-floor" && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-5">
                  <p className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-cyan-700">
                    <Layers3 size={14} />
                    Resolucion por terreno
                  </p>
                  <h3 className="mt-3 text-xl font-black text-slate-950">Esquema de unidades por piso</h3>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    Cuando el error sea ubicacion de unidad fuera del terreno, el saneamiento debe abrir este esquema,
                    elegir la unidad y permitir editar sus atributos de migracion. Solo las unidades de primera planta
                    quedan obligadas por la regla espacial.
                  </p>
                </div>

                <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
                  <div className="space-y-3">
                    {Object.entries(groupedUnits)
                      .sort(([a], [b]) => Number(b) - Number(a))
                      .map(([floor, floorUnits]) => (
                        <div key={floor} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Building2 size={18} className="text-slate-500" />
                              <p className="text-sm font-black text-slate-950">Piso {floor}</p>
                            </div>
                            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                              {floorUnits.length} unidades
                            </span>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {floorUnits.map((unit) => {
                              const applies = shouldValidateUnitInsideTerrain(unit, activeRule);
                              const selected = selectedUnit.id === unit.id;
                              return (
                                <button
                                  key={unit.id}
                                  type="button"
                                  onClick={() => setSelectedUnitId(unit.id)}
                                  className={`rounded-xl border p-3 text-left transition ${
                                    selected
                                      ? "border-indigo-400 bg-white ring-2 ring-indigo-100"
                                      : "border-slate-200 bg-white hover:border-indigo-200"
                                  }`}
                                >
                                  <p className="text-sm font-black text-slate-950">{unit.label || unit.id}</p>
                                  <p className="mt-1 text-xs font-semibold text-slate-500">{unit.id}</p>
                                  <span
                                    className={`mt-3 inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                                      applies ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                                    }`}
                                  >
                                    {applies ? "Valida terreno" : "Exenta por piso"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Unidad seleccionada</p>
                        <h4 className="mt-1 text-lg font-black text-slate-950">{selectedUnit.label || selectedUnit.id}</h4>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] ${
                          firstFloorApplies ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                        }`}
                      >
                        {firstFloorApplies ? "Regla aplica" : "Regla no aplica"}
                      </span>
                    </div>

                    <div className="mt-4 rounded-xl bg-slate-50 p-4">
                      <div className="flex items-start gap-2">
                        <ClipboardCheck size={18} className="mt-0.5 text-indigo-500" />
                        <p className="text-sm font-semibold text-slate-600">
                          {firstFloorApplies
                            ? "Esta unidad esta en primera planta, por eso debe estar dentro del terreno y puede requerir ajuste espacial o de atributos."
                            : "Esta unidad esta en un piso superior, asi que no debe fallar por no estar contenida geometricamente dentro del terreno."}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-indigo-500">
                        <Edit3 size={14} />
                        Atributos de migracion editables
                      </p>
                      {["piso", "uso", "matricula", "estado_migracion"].map((key) => (
                        <label key={key} className="block">
                          <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-400">{key}</span>
                          <Input
                            value={String(selectedUnit.migrationAttributes?.[key] ?? "")}
                            onChange={(event) => updateSelectedUnitAttribute(key, event.target.value)}
                            className="h-10 bg-white font-semibold"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
