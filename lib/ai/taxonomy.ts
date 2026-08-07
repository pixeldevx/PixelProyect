import { createHash } from 'crypto';
import { stableStringify } from '@/lib/ai/api';

export const VANTI_APPLICATION_ID = 'vanti-suite';
export const VANTI_TAXONOMY_VERSION = 'vanti-domains-1';
export const VANTI_CLIP_MODEL = 'openai/clip-vit-base-patch32';
export const VANTI_PREPROCESS_VERSION = 'clip-default-1';

export const VANTI_DOMAIN_DEFINITION = {
  version: VANTI_TAXONOMY_VERSION,
  usos: ['RESIDENCIAL', 'COMERCIAL', 'LOTE', 'INSTITUCIONAL', 'INDUSTRIAL', 'MIXTO'],
  pairs: {
    RESIDENCIAL: ['CASA', 'APARTAESTUDIO', 'APARTAMENTO'],
    COMERCIAL: ['RESTAURANTE', 'PANADERIA', 'LAVANDERIA', 'EXPENDIO DE COMIDAS', 'OFICINAS', 'OTROS NEGOCIOS', 'HOSTALES'],
    LOTE: ['EN CONSTRUCCION', 'EN PROYECTO', 'BALDIO'],
    INSTITUCIONAL: ['HOTELES', 'INSTITUCIONAL', 'UNIVERSIDAD', 'HOSPITAL'],
    INDUSTRIAL: ['INDUSTRIAL'],
    MIXTO: ['RESTAURANTE', 'PANADERIA', 'LAVANDERIA', 'EXPENDIO DE COMIDAS', 'HOTELES', 'OFICINAS', 'OTROS NEGOCIOS', 'INDUSTRIAL', 'INSTITUCIONAL', 'HOSTALES'],
  },
  visual_review_excluded: ['BALDIO', 'APARTAMENTO'],
} as const;

export const VANTI_TAXONOMY_CHECKSUM = createHash('sha256')
  .update(stableStringify(VANTI_DOMAIN_DEFINITION))
  .digest('hex');

const normalizeLabel = (value: unknown) =>
  typeof value === 'string' ? value.trim().toUpperCase() : '';

export const isExcludedVantiClass = (uso: unknown, actividad: unknown) => {
  const normalizedUso = normalizeLabel(uso);
  const normalizedActividad = normalizeLabel(actividad);
  return normalizedActividad === 'BALDIO' || normalizedActividad === 'APARTAMENTO' || normalizedUso === 'BALDIO' || normalizedUso === 'APARTAMENTO';
};

export const isValidVantiPair = (uso: unknown, actividad: unknown) => {
  const normalizedUso = normalizeLabel(uso) as keyof typeof VANTI_DOMAIN_DEFINITION.pairs;
  const normalizedActividad = normalizeLabel(actividad);
  return Boolean(
    normalizedUso &&
      normalizedActividad &&
      Object.prototype.hasOwnProperty.call(VANTI_DOMAIN_DEFINITION.pairs, normalizedUso) &&
      (VANTI_DOMAIN_DEFINITION.pairs[normalizedUso] as readonly string[]).includes(normalizedActividad),
  );
};

export const vantiUsoLabels = [...VANTI_DOMAIN_DEFINITION.usos];

