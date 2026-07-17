import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReceiptCategoryInput = {
  id?: string;
  name?: string;
  requiresCufe?: boolean;
  defaultDailyAmount?: number;
  description?: string;
};

type ParsedReceipt = {
  categoryId?: string | null;
  categoryName?: string | null;
  amount?: number | string | null;
  date?: string | null;
  businessName?: string | null;
  taxId?: string | null;
  invoiceNumber?: string | null;
  cufe?: string | null;
  description?: string | null;
  confidence?: number | string | null;
  warnings?: string[] | null;
};

const MAX_FILES = 12;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf']);
const MODEL = process.env.OPENAI_RECEIPT_MODEL || 'gpt-4.1-mini';

const json = (body: Record<string, any>, status = 200) => NextResponse.json(body, { status });

const isAllowedFile = (file: File) =>
  file.type.startsWith('image/') || ALLOWED_TYPES.has(file.type);

const safeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeAmount = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  let text = String(value ?? '')
    .replace(/[^\d,.-]/g, '')
    .trim();

  if (!text) return 0;

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');

  if (hasComma && hasDot) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    const parts = text.split(',');
    const decimals = parts.at(-1) || '';
    text = decimals.length <= 2 ? `${parts.slice(0, -1).join('')}.${decimals}` : parts.join('');
  } else if (hasDot) {
    const parts = text.split('.');
    const last = parts.at(-1) || '';
    if (parts.length > 2 || last.length === 3) {
      text = parts.join('');
    }
  }

  const amount = Number.parseFloat(text);
  return Number.isFinite(amount) ? amount : 0;
};

const normalizeDate = (value: unknown) => {
  const text = safeText(value);
  if (!text) return '';

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, '0');
    const month = slashMatch[2].padStart(2, '0');
    const rawYear = slashMatch[3];
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return `${year}-${month}-${day}`;
  }

  return '';
};

const parseJsonPayload = (text: string): ParsedReceipt => {
  const clean = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  const payload = start >= 0 && end >= start ? clean.slice(start, end + 1) : clean;
  return JSON.parse(payload);
};

const getResponseText = (payload: any) => {
  if (typeof payload?.output_text === 'string') return payload.output_text;

  const chunks: string[] = [];
  for (const output of payload?.output || []) {
    for (const content of output?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
      if (typeof content?.output_text === 'string') chunks.push(content.output_text);
    }
  }
  return chunks.join('\n').trim();
};

const buildPrompt = (categories: ReceiptCategoryInput[], advanceContext: unknown) => `
Eres un asistente de legalización de anticipos en Colombia.
Lee el soporte adjunto, identifica el gasto y elige la categoría más cercana.

Categorías disponibles:
${JSON.stringify(categories, null, 2)}

Contexto del anticipo:
${JSON.stringify(advanceContext || {}, null, 2)}

Devuelve SOLO un JSON válido con esta forma:
{
  "categoryId": "id exacto de la categoría elegida o vacío si no hay certeza",
  "categoryName": "nombre de la categoría elegida",
  "amount": 0,
  "date": "YYYY-MM-DD",
  "businessName": "proveedor o razón social",
  "taxId": "NIT o documento si aparece",
  "invoiceNumber": "número de factura o recibo si aparece",
  "cufe": "CUFE si aparece",
  "description": "resumen corto del gasto",
  "confidence": 0.0,
  "warnings": ["dudas o campos ausentes"]
}

Reglas:
- No inventes valores. Si un campo no se ve, déjalo vacío y agrega una advertencia.
- amount debe ser el total pagado del soporte, sin símbolos.
- date debe ser la fecha del gasto, no la fecha de vencimiento.
- Si aparece CUFE o factura electrónica, conserva el CUFE completo.
`.trim();

const normalizeReceipt = ({
  parsed,
  categories,
  file,
  index,
}: {
  parsed: ParsedReceipt;
  categories: ReceiptCategoryInput[];
  file: File;
  index: number;
}) => {
  const categoryById = categories.find((category) => category.id && category.id === parsed.categoryId);
  const parsedCategoryName = safeText(parsed.categoryName).toLowerCase();
  const categoryByName = categories.find((category) => safeText(category.name).toLowerCase() === parsedCategoryName);
  const category = categoryById || categoryByName || categories[0] || {};
  const amount = normalizeAmount(parsed.amount);
  const confidence = Number(parsed.confidence);
  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.map((warning) => safeText(warning)).filter(Boolean)
    : [];

  if (!amount) warnings.push('No se pudo leer un valor total confiable.');
  if (!safeText(parsed.businessName)) warnings.push('No se identificó razón social o proveedor.');
  if (category.requiresCufe && !safeText(parsed.cufe)) warnings.push('La categoría seleccionada requiere CUFE.');

  return {
    index,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || 'application/octet-stream',
    status: 'ready',
    categoryId: category.id || '',
    categoryName: category.name || safeText(parsed.categoryName),
    amount,
    date: normalizeDate(parsed.date),
    businessName: safeText(parsed.businessName),
    taxId: safeText(parsed.taxId),
    invoiceNumber: safeText(parsed.invoiceNumber),
    cufe: safeText(parsed.cufe),
    description: safeText(parsed.description),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    warnings,
  };
};

const analyzeFile = async ({
  apiKey,
  file,
  index,
  categories,
  advanceContext,
}: {
  apiKey: string;
  file: File;
  index: number;
  categories: ReceiptCategoryInput[];
  advanceContext: unknown;
}) => {
  if (!isAllowedFile(file)) {
    return {
      index,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
      status: 'error',
      error: 'Solo se aceptan imágenes o PDF.',
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      index,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
      status: 'error',
      error: 'El archivo supera el límite de 10 MB para lectura inteligente.',
    };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
    const content =
      file.type === 'application/pdf'
        ? [
            { type: 'input_text', text: buildPrompt(categories, advanceContext) },
            { type: 'input_file', filename: file.name, file_data: dataUrl },
          ]
        : [
            { type: 'input_text', text: buildPrompt(categories, advanceContext) },
            { type: 'input_image', image_url: dataUrl },
          ];

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        input: [{ role: 'user', content }],
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error?.message || `OpenAI rechazó el análisis (${response.status}).`);
    }

    const text = getResponseText(payload);
    if (!text) throw new Error('El modelo no devolvió contenido legible.');

    return normalizeReceipt({
      parsed: parseJsonPayload(text),
      categories,
      file,
      index,
    });
  } catch (error: any) {
    console.error('Error analyzing receipt:', error);
    return {
      index,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
      status: 'error',
      error: error?.message || 'No se pudo analizar este soporte.',
    };
  }
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: 'Falta configurar OPENAI_API_KEY en Vercel para activar la lectura inteligente.' }, 500);
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((item): item is File => item instanceof File);

    if (files.length === 0) {
      return json({ error: 'Adjunta al menos un recibo o factura.' }, 400);
    }
    if (files.length > MAX_FILES) {
      return json({ error: `Puedes analizar máximo ${MAX_FILES} soportes por lote.` }, 400);
    }

    const categories = JSON.parse(String(formData.get('categories') || '[]')) as ReceiptCategoryInput[];
    const advanceContext = JSON.parse(String(formData.get('advanceContext') || '{}'));
    if (!Array.isArray(categories) || categories.length === 0) {
      return json({ error: 'No hay dominios de gasto disponibles para clasificar los soportes.' }, 400);
    }

    const receipts = [];
    for (let index = 0; index < files.length; index += 1) {
      receipts.push(await analyzeFile({ apiKey, file: files[index], index, categories, advanceContext }));
    }

    return json({ receipts });
  } catch (error: any) {
    console.error('Error in receipt analysis endpoint:', error);
    return json({ error: error?.message || 'No se pudo analizar el lote de soportes.' }, 500);
  }
}
