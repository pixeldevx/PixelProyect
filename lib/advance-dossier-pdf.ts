import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
} from 'pdf-lib';

export type AdvanceDossierAttachment = {
  label: string;
  description?: string;
  fileName: string;
  url?: string;
  blob?: Blob;
};

export type AdvanceDossierSignature = {
  role: string;
  name: string;
  jobTitle?: string;
  email?: string;
  signedAt?: string;
  imageUrl?: string;
};

export type AdvanceDossierReport = {
  title: string;
  advanceId: string;
  projectName: string;
  status: string;
  generatedAt: string;
  sections?: {
    payment?: boolean;
    legalizations?: boolean;
    reconciliation?: boolean;
  };
  metrics: Array<{ label: string; value: string }>;
  advanceDetails: Array<{ label: string; value: string }>;
  items: string[][];
  costCenters: string[][];
  signatures: AdvanceDossierSignature[];
  paymentDetails: Array<{ label: string; value: string }>;
  legalizations: string[][];
  reconciliationDetails: Array<{ label: string; value: string }>;
  paymentAttachment?: AdvanceDossierAttachment;
  legalizationAttachments: AdvanceDossierAttachment[];
  reconciliationAttachments: AdvanceDossierAttachment[];
};

type PdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
  oblique: PDFFont;
};

type TableOptions = {
  headers: string[];
  rows: string[][];
  widths: number[];
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const CONTENT_BOTTOM = 46;
const HEADER_NAVY = rgb(0.035, 0.055, 0.15);
const INDIGO = rgb(0.31, 0.27, 0.9);
const TEAL = rgb(0.06, 0.47, 0.44);
const SLATE_950 = rgb(0.06, 0.09, 0.16);
const SLATE_700 = rgb(0.2, 0.25, 0.34);
const SLATE_500 = rgb(0.39, 0.45, 0.55);
const SLATE_300 = rgb(0.8, 0.84, 0.89);
const SLATE_100 = rgb(0.94, 0.96, 0.98);
const INDIGO_50 = rgb(0.93, 0.94, 1);
const WHITE = rgb(1, 1, 1);

const normalizePdfText = (value: unknown) =>
  String(value ?? '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\u00b7/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ');

const fitText = (font: PDFFont, text: string, size: number, maxWidth: number) => {
  const normalized = normalizePdfText(text);
  if (font.widthOfTextAtSize(normalized, size) <= maxWidth) return normalized;
  const ellipsis = '...';
  let fitted = normalized;
  while (fitted.length > 1 && font.widthOfTextAtSize(`${fitted}${ellipsis}`, size) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted.trimEnd()}${ellipsis}`;
};

const wrapText = (font: PDFFont, value: unknown, size: number, maxWidth: number) => {
  const text = normalizePdfText(value).trim();
  if (!text) return [''];
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/);
    let current = '';

    words.forEach((word) => {
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        if (current) {
          lines.push(current);
          current = '';
        }
        let fragment = '';
        Array.from(word).forEach((character) => {
          const candidate = `${fragment}${character}`;
          if (fragment && font.widthOfTextAtSize(candidate, size) > maxWidth) {
            lines.push(fragment);
            fragment = character;
          } else {
            fragment = candidate;
          }
        });
        current = fragment;
        return;
      }

      const candidate = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    });

    if (current) lines.push(current);
    if (!paragraph && lines.length === 0) lines.push('');
  });

  return lines.length > 0 ? lines : [''];
};

const getFileKind = (fileName: string, contentType: string) => {
  const normalizedType = contentType.toLowerCase();
  const extension = fileName.toLowerCase().split('.').pop() || '';
  if (normalizedType.includes('pdf') || extension === 'pdf') return 'pdf';
  if (normalizedType.includes('png') || extension === 'png') return 'png';
  if (
    normalizedType.includes('jpeg') ||
    normalizedType.includes('jpg') ||
    extension === 'jpg' ||
    extension === 'jpeg'
  ) {
    return 'jpg';
  }
  if (normalizedType.startsWith('image/') || ['webp', 'gif', 'bmp'].includes(extension)) return 'image';
  return 'unsupported';
};

const convertImageBlobToPng = async (blob: Blob) => {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar la imagen para el expediente.');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('No se pudo convertir la imagen a PDF.'))),
      'image/png'
    );
  });
  return new Uint8Array(await pngBlob.arrayBuffer());
};

const fetchAsset = async (
  attachment: Pick<AdvanceDossierAttachment, 'fileName' | 'url' | 'blob'>
) => {
  let blob = attachment.blob;
  let responseContentType = '';

  if (!blob) {
    if (!attachment.url) throw new Error('El anexo no tiene un archivo disponible.');
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error(`No se pudo descargar el anexo (${response.status}).`);
    responseContentType = response.headers.get('content-type') || '';
    blob = await response.blob();
  }

  return {
    blob,
    bytes: new Uint8Array(await blob.arrayBuffer()),
    kind: getFileKind(attachment.fileName, blob.type || responseContentType),
  };
};

const embedImageAsset = async (
  pdf: PDFDocument,
  asset: Awaited<ReturnType<typeof fetchAsset>>
): Promise<PDFImage> => {
  if (asset.kind === 'png') return pdf.embedPng(asset.bytes);
  if (asset.kind === 'jpg') return pdf.embedJpg(asset.bytes);
  if (asset.kind === 'image') return pdf.embedPng(await convertImageBlobToPng(asset.blob));
  throw new Error('El archivo no es una imagen compatible.');
};

export const generateAdvanceDossierPdf = async (report: AdvanceDossierReport) => {
  const pdf = await PDFDocument.create();
  const fonts: PdfFonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    oblique: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };

  pdf.setTitle(normalizePdfText(`${report.title} ${report.advanceId}`));
  pdf.setSubject('Expediente documental de anticipo');
  pdf.setAuthor('Pixel Project');
  pdf.setCreator('Pixel Project');

  let page!: PDFPage;
  let y = PAGE_HEIGHT - 40;

  const drawFooter = (target: PDFPage) => {
    target.drawLine({
      start: { x: MARGIN_X, y: 30 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: 30 },
      thickness: 0.6,
      color: SLATE_300,
    });
    target.drawText('PIXEL PROJECT - EXPEDIENTE DOCUMENTAL', {
      x: MARGIN_X,
      y: 17,
      size: 7,
      font: fonts.bold,
      color: SLATE_500,
    });
  };

  const addReportPage = (showTopLabel = true) => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - 42;
    if (showTopLabel) {
      page.drawText('PIXEL PROJECT', {
        x: MARGIN_X,
        y,
        size: 8,
        font: fonts.bold,
        color: TEAL,
      });
      y -= 22;
    }
    drawFooter(page);
    return page;
  };

  const ensureSpace = (required: number) => {
    if (y - required < CONTENT_BOTTOM) addReportPage();
  };

  const drawLines = (
    lines: string[],
    x: number,
    startY: number,
    font: PDFFont,
    size: number,
    color = SLATE_950,
    lineHeight = size + 2
  ) => {
    lines.forEach((line, index) => {
      if (!line) return;
      page.drawText(line, {
        x,
        y: startY - index * lineHeight,
        size,
        font,
        color,
      });
    });
  };

  const drawSectionTitle = (step: number, title: string, forceNewPage = false) => {
    if (forceNewPage) addReportPage();
    ensureSpace(42);
    page.drawCircle({ x: MARGIN_X + 12, y: y - 11, size: 12, color: INDIGO });
    const stepText = String(step);
    page.drawText(stepText, {
      x: MARGIN_X + 12 - fonts.bold.widthOfTextAtSize(stepText, 9) / 2,
      y: y - 14,
      size: 9,
      font: fonts.bold,
      color: WHITE,
    });
    page.drawText(normalizePdfText(title), {
      x: MARGIN_X + 34,
      y: y - 16,
      size: 16,
      font: fonts.bold,
      color: SLATE_950,
    });
    y -= 42;
  };

  const drawSubheading = (title: string) => {
    ensureSpace(28);
    page.drawText(normalizePdfText(title), {
      x: MARGIN_X,
      y,
      size: 11,
      font: fonts.bold,
      color: SLATE_700,
    });
    y -= 18;
  };

  const drawMetrics = (metrics: AdvanceDossierReport['metrics']) => {
    const columns = 3;
    const gap = 8;
    const cardWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
    const rows = Math.ceil(metrics.length / columns);
    ensureSpace(rows * 62 + 6);

    metrics.forEach((metric, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = MARGIN_X + column * (cardWidth + gap);
      const top = y - row * 62;
      page.drawRectangle({
        x,
        y: top - 54,
        width: cardWidth,
        height: 54,
        color: SLATE_100,
        borderColor: SLATE_300,
        borderWidth: 0.7,
      });
      page.drawText(fitText(fonts.bold, metric.label.toUpperCase(), 7, cardWidth - 16), {
        x: x + 8,
        y: top - 16,
        size: 7,
        font: fonts.bold,
        color: SLATE_500,
      });
      page.drawText(fitText(fonts.bold, metric.value, 13, cardWidth - 16), {
        x: x + 8,
        y: top - 38,
        size: 13,
        font: fonts.bold,
        color: SLATE_950,
      });
    });
    y -= rows * 62 + 8;
  };

  const drawKeyValues = (entries: Array<{ label: string; value: string }>) => {
    const cellWidth = CONTENT_WIDTH / 2;
    for (let index = 0; index < entries.length; index += 2) {
      const pair = entries.slice(index, index + 2);
      const wrapped = pair.map((entry) => wrapText(fonts.regular, entry.value || '-', 9, cellWidth - 18));
      const rowHeight = Math.max(38, ...wrapped.map((lines) => lines.length * 11 + 22));
      ensureSpace(rowHeight);

      pair.forEach((entry, pairIndex) => {
        const x = MARGIN_X + pairIndex * cellWidth;
        page.drawRectangle({
          x,
          y: y - rowHeight,
          width: cellWidth,
          height: rowHeight,
          color: pairIndex % 2 === 0 ? SLATE_100 : WHITE,
          borderColor: SLATE_300,
          borderWidth: 0.6,
        });
        page.drawText(fitText(fonts.bold, entry.label.toUpperCase(), 7, cellWidth - 18), {
          x: x + 9,
          y: y - 14,
          size: 7,
          font: fonts.bold,
          color: SLATE_500,
        });
        drawLines(wrapped[pairIndex], x + 9, y - 28, fonts.regular, 9, SLATE_950, 11);
      });
      if (pair.length === 1) {
        page.drawRectangle({
          x: MARGIN_X + cellWidth,
          y: y - rowHeight,
          width: cellWidth,
          height: rowHeight,
          color: WHITE,
          borderColor: SLATE_300,
          borderWidth: 0.6,
        });
      }
      y -= rowHeight;
    }
    y -= 10;
  };

  const drawTable = ({ headers, rows, widths }: TableOptions) => {
    const columnWidths = widths.map((width) => width * CONTENT_WIDTH);
    const headerHeight = 28;

    const drawHeader = () => {
      ensureSpace(headerHeight + 24);
      let x = MARGIN_X;
      headers.forEach((header, index) => {
        const width = columnWidths[index];
        page.drawRectangle({
          x,
          y: y - headerHeight,
          width,
          height: headerHeight,
          color: SLATE_100,
          borderColor: SLATE_300,
          borderWidth: 0.6,
        });
        const headerLines = wrapText(fonts.bold, header.toUpperCase(), 6.5, width - 10).slice(0, 2);
        drawLines(headerLines, x + 5, y - 11, fonts.bold, 6.5, SLATE_500, 8);
        x += width;
      });
      y -= headerHeight;
    };

    drawHeader();
    if (rows.length === 0) {
      const height = 34;
      page.drawRectangle({
        x: MARGIN_X,
        y: y - height,
        width: CONTENT_WIDTH,
        height,
        color: WHITE,
        borderColor: SLATE_300,
        borderWidth: 0.6,
      });
      page.drawText('Sin registros.', {
        x: MARGIN_X + 8,
        y: y - 21,
        size: 8.5,
        font: fonts.oblique,
        color: SLATE_500,
      });
      y -= height + 10;
      return;
    }

    rows.forEach((row, rowIndex) => {
      const wrapped = headers.map((_, index) =>
        wrapText(fonts.regular, row[index] || '', 7.5, columnWidths[index] - 10)
      );
      const rowHeight = Math.max(28, ...wrapped.map((lines) => lines.length * 9 + 10));
      if (y - rowHeight < CONTENT_BOTTOM) {
        addReportPage();
        drawHeader();
      }
      let x = MARGIN_X;
      wrapped.forEach((lines, index) => {
        const width = columnWidths[index];
        page.drawRectangle({
          x,
          y: y - rowHeight,
          width,
          height: rowHeight,
          color: rowIndex % 2 === 0 ? WHITE : rgb(0.98, 0.985, 0.995),
          borderColor: SLATE_300,
          borderWidth: 0.6,
        });
        drawLines(
          lines,
          x + 5,
          y - 12,
          index === headers.length - 1 ? fonts.bold : fonts.regular,
          7.5,
          SLATE_950,
          9
        );
        x += width;
      });
      y -= rowHeight;
    });
    y -= 12;
  };

  const drawSignatures = async (signatures: AdvanceDossierSignature[]) => {
    if (signatures.length === 0) return;
    const boxGap = 12;
    const boxWidth = (CONTENT_WIDTH - boxGap) / 2;
    const boxHeight = 116;
    ensureSpace(boxHeight + 8);

    const embeddedImages = await Promise.all(
      signatures.slice(0, 2).map(async (signature) => {
        if (!signature.imageUrl) return null;
        try {
          const asset = await fetchAsset({ fileName: 'signature.png', url: signature.imageUrl });
          return embedImageAsset(pdf, asset);
        } catch {
          return null;
        }
      })
    );

    signatures.slice(0, 2).forEach((signature, index) => {
      const x = MARGIN_X + index * (boxWidth + boxGap);
      page.drawRectangle({
        x,
        y: y - boxHeight,
        width: boxWidth,
        height: boxHeight,
        color: INDIGO_50,
        borderColor: rgb(0.75, 0.79, 1),
        borderWidth: 0.8,
      });
      page.drawText(fitText(fonts.bold, signature.role.toUpperCase(), 7, boxWidth - 18), {
        x: x + 9,
        y: y - 15,
        size: 7,
        font: fonts.bold,
        color: INDIGO,
      });
      const image = embeddedImages[index];
      if (image) {
        const availableWidth = boxWidth - 32;
        const availableHeight = 48;
        const scale = Math.min(availableWidth / image.width, availableHeight / image.height, 1);
        const imageWidth = image.width * scale;
        const imageHeight = image.height * scale;
        page.drawImage(image, {
          x: x + (boxWidth - imageWidth) / 2,
          y: y - 22 - imageHeight,
          width: imageWidth,
          height: imageHeight,
        });
      } else {
        page.drawLine({
          start: { x: x + 24, y: y - 62 },
          end: { x: x + boxWidth - 24, y: y - 62 },
          thickness: 0.7,
          color: SLATE_300,
        });
      }
      page.drawText(fitText(fonts.bold, signature.name || 'Pendiente', 9, boxWidth - 18), {
        x: x + 9,
        y: y - 78,
        size: 9,
        font: fonts.bold,
        color: SLATE_950,
      });
      page.drawText(fitText(fonts.regular, signature.jobTitle || 'Sin cargo', 7.5, boxWidth - 18), {
        x: x + 9,
        y: y - 91,
        size: 7.5,
        font: fonts.regular,
        color: SLATE_500,
      });
      page.drawText(fitText(fonts.regular, signature.email || '', 7, boxWidth - 18), {
        x: x + 9,
        y: y - 103,
        size: 7,
        font: fonts.regular,
        color: SLATE_500,
      });
    });
    y -= boxHeight + 12;
  };

  const addAttachmentDivider = (attachment: AdvanceDossierAttachment, ordinal?: number) => {
    const divider = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    divider.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      color: HEADER_NAVY,
    });
    divider.drawRectangle({
      x: MARGIN_X,
      y: PAGE_HEIGHT - 235,
      width: 7,
      height: 145,
      color: TEAL,
    });
    divider.drawText('ANEXO DOCUMENTAL', {
      x: MARGIN_X + 28,
      y: PAGE_HEIGHT - 105,
      size: 10,
      font: fonts.bold,
      color: rgb(0.55, 0.97, 0.87),
    });
    const title = ordinal ? `${ordinal}. ${attachment.label}` : attachment.label;
    const titleLines = wrapText(fonts.bold, title.toUpperCase(), 22, CONTENT_WIDTH - 38);
    drawTextOnPage(divider, titleLines, MARGIN_X + 28, PAGE_HEIGHT - 145, fonts.bold, 22, WHITE, 27);
    const descriptionLines = wrapText(
      fonts.regular,
      attachment.description || 'El documento cargado se incorpora completo en las páginas siguientes.',
      11,
      CONTENT_WIDTH - 38
    );
    drawTextOnPage(
      divider,
      descriptionLines,
      MARGIN_X + 28,
      PAGE_HEIGHT - 155 - titleLines.length * 27,
      fonts.regular,
      11,
      rgb(0.8, 0.84, 0.9),
      15
    );
    divider.drawText('El soporte original se anexa a continuación.', {
      x: MARGIN_X + 28,
      y: 72,
      size: 10,
      font: fonts.bold,
      color: WHITE,
    });
  };

  type PreparedAttachment =
    | {
        attachment: AdvanceDossierAttachment;
        kind: 'pdf';
        pages: PDFPage[];
      }
    | {
        attachment: AdvanceDossierAttachment;
        kind: 'image';
        image: PDFImage;
      };

  const omittedAttachments: string[] = [];

  const prepareAttachment = async (
    attachment: AdvanceDossierAttachment
  ): Promise<PreparedAttachment | null> => {
    try {
      const asset = await fetchAsset(attachment);

      if (asset.kind === 'pdf') {
        const source = await PDFDocument.load(asset.bytes);
        const pages = await pdf.copyPages(source, source.getPageIndices());
        if (pages.length === 0) throw new Error('El PDF no contiene páginas.');
        return { attachment, kind: 'pdf', pages };
      }

      if (asset.kind === 'unsupported') {
        throw new Error('El formato no es PDF ni una imagen compatible.');
      }

      return {
        attachment,
        kind: 'image',
        image: await embedImageAsset(pdf, asset),
      };
    } catch (error) {
      omittedAttachments.push(attachment.label);
      console.warn(`Se omitió el anexo "${attachment.label}" del expediente:`, error);
      return null;
    }
  };

  const appendPreparedAttachment = (prepared: PreparedAttachment, ordinal?: number) => {
    addAttachmentDivider(prepared.attachment, ordinal);

    if (prepared.kind === 'pdf') {
      prepared.pages.forEach((copiedPage) => pdf.addPage(copiedPage));
      return;
    }

    const image = prepared.image;
    const imagePage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    imagePage.drawText(
      fitText(fonts.bold, prepared.attachment.label.toUpperCase(), 8, CONTENT_WIDTH),
      {
        x: MARGIN_X,
        y: PAGE_HEIGHT - 30,
        size: 8,
        font: fonts.bold,
        color: SLATE_700,
      }
    );
    const availableWidth = CONTENT_WIDTH;
    const availableHeight = PAGE_HEIGHT - 86;
    const scale = Math.min(availableWidth / image.width, availableHeight / image.height, 1);
    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;
    imagePage.drawImage(image, {
      x: (PAGE_WIDTH - imageWidth) / 2,
      y: (PAGE_HEIGHT - imageHeight) / 2 - 8,
      width: imageWidth,
      height: imageHeight,
    });
  };

  const appendAttachmentGroup = async (
    step: number,
    title: string,
    attachments: AdvanceDossierAttachment[]
  ) => {
    const preparedResults = await Promise.all(
      attachments.map((attachment) => prepareAttachment(attachment))
    );
    const preparedAttachments = preparedResults.filter(
      (attachment): attachment is PreparedAttachment => Boolean(attachment)
    );
    const omittedCount = attachments.length - preparedAttachments.length;

    addReportPage();
    drawSectionTitle(step, title);
    if (preparedAttachments.length === 0) {
      page.drawText(
        attachments.length === 0
          ? 'No se cargaron documentos para esta etapa.'
          : 'Los documentos cargados no estaban disponibles o no tenían un formato válido. El expediente continúa sin esos anexos.',
        {
          x: MARGIN_X,
          y,
          size: 10,
          font: fonts.oblique,
          color: SLATE_500,
        }
      );
      y -= 22;
      return;
    }
    page.drawText(
      normalizePdfText(
        `${preparedAttachments.length} documento${preparedAttachments.length === 1 ? '' : 's'} se anexa${preparedAttachments.length === 1 ? '' : 'n'} completo${preparedAttachments.length === 1 ? '' : 's'} a continuación.`
      ),
      {
        x: MARGIN_X,
        y,
        size: 10,
        font: fonts.regular,
        color: SLATE_700,
      }
    );
    preparedAttachments.forEach((prepared, index) => {
      page.drawText(fitText(fonts.bold, `${index + 1}. ${prepared.attachment.label}`, 9, CONTENT_WIDTH - 10), {
        x: MARGIN_X + 8,
        y: y - 24 - index * 18,
        size: 9,
        font: fonts.bold,
        color: SLATE_950,
      });
    });
    if (omittedCount > 0) {
      page.drawText(
        normalizePdfText(
          `${omittedCount} archivo${omittedCount === 1 ? '' : 's'} se omitió${omittedCount === 1 ? '' : 'eron'} por no estar disponible${omittedCount === 1 ? '' : 's'} o estar dañado${omittedCount === 1 ? '' : 's'}.`
        ),
        {
          x: MARGIN_X + 8,
          y: y - 32 - preparedAttachments.length * 18,
          size: 8,
          font: fonts.oblique,
          color: SLATE_500,
        }
      );
    }
    preparedAttachments.forEach((prepared, index) => {
      appendPreparedAttachment(prepared, index + 1);
    });
  };

  addReportPage(false);
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 176,
    width: PAGE_WIDTH,
    height: 176,
    color: HEADER_NAVY,
  });
  page.drawText('PIXEL PROJECT - EXPEDIENTE DE ANTICIPO', {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 52,
    size: 9,
    font: fonts.bold,
    color: rgb(0.55, 0.97, 0.87),
  });
  const reportTitle = fitText(fonts.bold, report.title, 24, CONTENT_WIDTH);
  page.drawText(reportTitle, {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 92,
    size: 24,
    font: fonts.bold,
    color: WHITE,
  });
  page.drawText(fitText(fonts.bold, report.advanceId, 14, CONTENT_WIDTH), {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 121,
    size: 14,
    font: fonts.bold,
    color: rgb(0.77, 0.8, 1),
  });
  page.drawText(
    fitText(fonts.regular, `${report.projectName} - ${report.status} - ${report.generatedAt}`, 9, CONTENT_WIDTH),
    {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 145,
      size: 9,
      font: fonts.regular,
      color: rgb(0.8, 0.84, 0.9),
    }
  );
  y = PAGE_HEIGHT - 206;

  drawSectionTitle(1, 'Anticipo y aprobación');
  drawMetrics(report.metrics);
  drawSubheading('Información del anticipo');
  drawKeyValues(report.advanceDetails);
  drawSubheading('Ítems solicitados');
  drawTable({
    headers: ['#', 'Concepto', 'Días / unidades', 'Valor unitario', 'Nota', 'Total'],
    rows: report.items,
    widths: [0.06, 0.22, 0.15, 0.18, 0.22, 0.17],
  });
  drawSubheading('Centros de costo');
  drawTable({
    headers: ['Centro', 'Porcentaje', 'Valor', 'Nota'],
    rows: report.costCenters,
    widths: [0.35, 0.17, 0.2, 0.28],
  });
  drawSubheading('Firmas verificadas');
  await drawSignatures(report.signatures);

  const sections = {
    payment: report.sections?.payment ?? true,
    legalizations: report.sections?.legalizations ?? true,
    reconciliation: report.sections?.reconciliation ?? true,
  };
  let sectionNumber = 2;

  if (sections.payment) {
    drawSectionTitle(sectionNumber, 'Pago del anticipo');
    sectionNumber += 1;
    if (report.paymentDetails.length > 0) {
      drawKeyValues(report.paymentDetails);
    } else {
      page.drawText('Pendiente de pago y de soporte.', {
        x: MARGIN_X,
        y,
        size: 10,
        font: fonts.oblique,
        color: SLATE_500,
      });
      y -= 22;
    }
    if (report.paymentAttachment) {
      const preparedPaymentAttachment = await prepareAttachment(report.paymentAttachment);
      if (preparedPaymentAttachment) {
        appendPreparedAttachment(preparedPaymentAttachment);
      } else {
        page.drawText('El soporte de pago no pudo anexarse. El expediente continúa sin ese archivo.', {
          x: MARGIN_X,
          y,
          size: 9,
          font: fonts.oblique,
          color: SLATE_500,
        });
        y -= 20;
      }
    }
  }

  if (sections.legalizations) {
    drawSectionTitle(sectionNumber, 'Legalización', true);
    sectionNumber += 1;
    drawTable({
      headers: ['#', 'Tipo', 'Proveedor', 'Fecha', 'Documento', 'Valor', 'Estado'],
      rows: report.legalizations,
      widths: [0.05, 0.18, 0.18, 0.13, 0.17, 0.15, 0.14],
    });

    await appendAttachmentGroup(
      sectionNumber,
      'Documentos soporte de la legalización',
      report.legalizationAttachments
    );
    sectionNumber += 1;
  }

  if (sections.reconciliation) {
    drawSectionTitle(sectionNumber, 'Conciliación', true);
    sectionNumber += 1;
    drawKeyValues(report.reconciliationDetails);

    await appendAttachmentGroup(
      sectionNumber,
      'Documentos soporte de la conciliación',
      report.reconciliationAttachments
    );
  }

  return {
    bytes: await pdf.save(),
    omittedAttachments,
  };
};

const drawTextOnPage = (
  page: PDFPage,
  lines: string[],
  x: number,
  startY: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  lineHeight: number
) => {
  lines.forEach((line, index) => {
    if (!line) return;
    page.drawText(line, {
      x,
      y: startY - index * lineHeight,
      size,
      font,
      color,
    });
  });
};
