export type MigrationRuleScope = "migration" | "procedure";
export type MigrationRuleSeverity = "warning" | "error" | "blocking";
export type MigrationRuleMode = "spatial" | "attribute" | "business";

export interface MigrationRule {
  id: string;
  code: string;
  name: string;
  description: string;
  scope: MigrationRuleScope;
  mode: MigrationRuleMode;
  severity: MigrationRuleSeverity;
  enabled: boolean;
  appliesTo: string;
  conditionSummary: string;
  resolutionHint: string;
  configurable: boolean;
  settings: {
    appliesOnlyToFirstFloor?: boolean;
    floorAttributeCandidates?: string[];
    terrainAttributeCandidates?: string[];
    unitAttributeCandidates?: string[];
  };
}

export interface MigrationUnitRecord {
  id: string;
  label?: string;
  floor?: string | number | null;
  attributes?: Record<string, any>;
  migrationAttributes?: Record<string, any>;
}

export const FIRST_FLOOR_ALIASES = new Set([
  "1",
  "01",
  "primer piso",
  "primera planta",
  "planta 1",
  "planta baja",
  "pb",
  "baja",
  "ground",
  "ground floor",
]);

export const DEFAULT_MIGRATION_RULES: MigrationRule[] = [
  {
    id: "unit-inside-terrain-first-floor",
    code: "MIG-SP-001",
    name: "Unidad dentro del terreno",
    description:
      "Valida que la geometria de la unidad este contenida por el terreno cuando la unidad pertenece a primera planta.",
    scope: "migration",
    mode: "spatial",
    severity: "blocking",
    enabled: true,
    appliesTo: "Unidades catastrales",
    conditionSummary:
      "Solo aplica a unidades en piso 1, primera planta o planta baja. Las unidades de pisos superiores quedan exentas de esta regla espacial.",
    resolutionHint:
      "Al resolver un terreno, revisa el esquema por pisos, selecciona la unidad afectada y ajusta sus atributos de migracion antes de volver a validar.",
    configurable: true,
    settings: {
      appliesOnlyToFirstFloor: true,
      floorAttributeCandidates: ["piso", "planta", "numero_piso", "nivel", "floor"],
      terrainAttributeCandidates: ["terreno_id", "codigo_terreno", "lotcodigo", "predio"],
      unitAttributeCandidates: ["unidad_id", "codigo_unidad", "u_codigo", "matricula"],
    },
  },
  {
    id: "migration-required-attributes",
    code: "MIG-AT-002",
    name: "Atributos minimos de migracion",
    description:
      "Comprueba que cada registro conserve los atributos minimos requeridos para trazabilidad de la migracion.",
    scope: "migration",
    mode: "attribute",
    severity: "error",
    enabled: true,
    appliesTo: "Terrenos, unidades y tramites",
    conditionSummary: "Aplica a todos los registros migrados.",
    resolutionHint:
      "Completa los atributos obligatorios desde la ficha de saneamiento antes de aprobar la migracion.",
    configurable: false,
    settings: {},
  },
  {
    id: "procedure-status-traceability",
    code: "TRA-BZ-003",
    name: "Trazabilidad de tramite",
    description:
      "Evita avanzar tramites sin responsable, estado y comentario minimo de decision.",
    scope: "procedure",
    mode: "business",
    severity: "error",
    enabled: true,
    appliesTo: "Tramites",
    conditionSummary: "Aplica cuando un tramite cambia de etapa o estado.",
    resolutionHint:
      "Registra responsable, estado destino y argumento para mantener la historia del tramite.",
    configurable: false,
    settings: {},
  },
];

const normalizeFloor = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

export const isFirstFloorUnit = (unit: Pick<MigrationUnitRecord, "floor" | "attributes" | "migrationAttributes">) => {
  const directFloor = normalizeFloor(unit.floor);
  if (FIRST_FLOOR_ALIASES.has(directFloor)) return true;

  const attrs = { ...(unit.attributes || {}), ...(unit.migrationAttributes || {}) };
  const candidates = DEFAULT_MIGRATION_RULES[0].settings.floorAttributeCandidates || [];

  return candidates.some((key) => FIRST_FLOOR_ALIASES.has(normalizeFloor(attrs[key])));
};

export const shouldValidateUnitInsideTerrain = (
  unit: Pick<MigrationUnitRecord, "floor" | "attributes" | "migrationAttributes">,
  rule?: MigrationRule
) => {
  const selectedRule = rule || DEFAULT_MIGRATION_RULES[0];
  if (!selectedRule.enabled) return false;
  if (!selectedRule.settings.appliesOnlyToFirstFloor) return true;
  return isFirstFloorUnit(unit);
};

export const normalizeMigrationRules = (value: any): MigrationRule[] => {
  const incoming = Array.isArray(value?.rules) ? value.rules : Array.isArray(value) ? value : [];
  const byId = new Map<string, MigrationRule>();

  DEFAULT_MIGRATION_RULES.forEach((rule) => byId.set(rule.id, rule));
  incoming.forEach((rule: Partial<MigrationRule>) => {
    if (!rule?.id) return;
    const fallback = byId.get(rule.id);
    byId.set(rule.id, {
      ...(fallback || DEFAULT_MIGRATION_RULES[0]),
      ...rule,
      settings: {
        ...(fallback?.settings || {}),
        ...(rule.settings || {}),
      },
    });
  });

  return Array.from(byId.values());
};
