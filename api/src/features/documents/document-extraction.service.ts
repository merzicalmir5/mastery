import { Injectable } from '@nestjs/common';
import { DocumentSourceType, DocumentType } from '@prisma/client';
import * as fs from 'fs/promises';
import {
  captureLooksLikeDate,
  extractAnyNumericDateLoose,
  extractCurrencyLoose,
  extractInvoiceFooterAmountsLoose,
  CSV_COLUMN_ALIASES,
  LOOSE_ROW_SKIP,
  META_ALIASES,
  classifyDocTypeHint,
  extractDueDateLoose,
  extractInvoiceNumberLoose,
  extractIssueDateLoose,
  extractMoneyAfterLabels,
  extractPoNumberLoose,
  extractSupplierLoose,
  pickMeta,
} from './document-i18n';
import { OCR_INITIAL_LANGS, detectTesseractRefinementLang } from './ocr-language';
import { preprocessImageForOcr } from './ocr-preprocess';

export type ExtractedLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ExtractionResult = {
  documentType: DocumentType | null;
  supplierName: string | null;
  documentNumber: string | null;
  issueDate: Date | null;
  dueDate: Date | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  lineItems: ExtractedLineItem[];
  rawExtractedData: Record<string, unknown>;
  ingestionNotes: string | null;
};

const LINE_ITEM_EPS = 0.02;

@Injectable()
export class DocumentExtractionService {
  async extractFromFile(
    absolutePath: string,
    sourceType: DocumentSourceType,
  ): Promise<ExtractionResult> {
    const buf = await fs.readFile(absolutePath);
    const base: ExtractionResult = {
      documentType: null,
      supplierName: null,
      documentNumber: null,
      issueDate: null,
      dueDate: null,
      currency: null,
      subtotal: null,
      tax: null,
      total: null,
      lineItems: [],
      rawExtractedData: {},
      ingestionNotes: null,
    };

    try {
      switch (sourceType) {
        case DocumentSourceType.CSV:
          return this.merge(base, this.parseCsv(buf.toString('utf8')));
        case DocumentSourceType.TXT:
          return this.merge(base, this.parseTextContent(buf.toString('utf8')));
        case DocumentSourceType.PDF:
          return this.merge(base, await this.parsePdf(buf));
        case DocumentSourceType.IMAGE:
          return this.merge(base, await this.parseImage(buf));
        default:
          return base;
      }
    } catch (err) {
      return {
        ...base,
        ingestionNotes: `Extraction error: ${err instanceof Error ? err.message : String(err)}`,
        rawExtractedData: { error: String(err) },
      };
    }
  }

  private merge(a: ExtractionResult, b: Partial<ExtractionResult>): ExtractionResult {
    return {
      documentType: b.documentType ?? a.documentType,
      supplierName: b.supplierName ?? a.supplierName,
      documentNumber: b.documentNumber ?? a.documentNumber,
      issueDate: b.issueDate ?? a.issueDate,
      dueDate: b.dueDate ?? a.dueDate,
      currency: b.currency ?? a.currency,
      subtotal: b.subtotal ?? a.subtotal,
      tax: b.tax ?? a.tax,
      total: b.total ?? a.total,
      lineItems: b.lineItems?.length ? b.lineItems : a.lineItems,
      rawExtractedData: { ...a.rawExtractedData, ...b.rawExtractedData },
      ingestionNotes: b.ingestionNotes ?? a.ingestionNotes,
    };
  }

  private async parsePdf(buffer: Buffer): Promise<Partial<ExtractionResult>> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require('pdf-parse') as {
      PDFParse: new (options: { data: Uint8Array }) => {
        getText: () => Promise<{ text: string }>;
        destroy: () => Promise<void>;
      };
    };
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const { text } = await parser.getText();
    await parser.destroy();
    return this.parseTextContent(text);
  }

  private readonly OCR_LINE_ITEMS_STOP_AT = 4;

  /** Debug: šta tesseract.js zapravo vrati iz worker.recognize (bez ogromnih polja tipa hocr/pdf). */
  private logTesseractRecognizeSnapshot(
    label: string,
    res: { jobId?: string; data?: Record<string, unknown> },
  ): void {
    const d = res?.data;
    if (!d) {
      console.log('[documents.ocr] recognize result', label, '(no data)');
      return;
    }
    const text = typeof d['text'] === 'string' ? d['text'] : '';
    const blocks = d['blocks'];
    const blockSumm =
      Array.isArray(blocks) && blocks.length
        ? (blocks as { text?: string; confidence?: number }[])
            .slice(0, 12)
            .map((b, i) => ({
              i,
              confidence: b.confidence,
              textPreview: (b.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 180),
            }))
        : [];
    console.log('[documents.ocr] recognize result', label, {
      jobId: res.jobId,
      version: d['version'],
      oem: d['oem'],
      psm: d['psm'],
      confidence: d['confidence'],
      textLength: text.length,
      textPreview: text.slice(0, 3500),
      blockCount: Array.isArray(blocks) ? blocks.length : 0,
      blocksPreview: blockSumm,
      hasTsv: typeof d['tsv'] === 'string' && (d['tsv'] as string).length > 0,
      hasHocr: typeof d['hocr'] === 'string' && (d['hocr'] as string).length > 0,
      rotateRadians: d['rotateRadians'],
    });
  }

  private async extractFromImageWithAdaptivePsm(
    image: Buffer,
    langs: string,
  ): Promise<{
    merged: Partial<ExtractionResult>;
    previewText: string;
    confidence: number | null;
    psmsUsed: string[];
  }> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Tesseract = require('tesseract.js') as typeof import('tesseract.js');
    const worker = await Tesseract.createWorker(langs, Tesseract.OEM.LSTM_ONLY, {});
    const psms = [
      Tesseract.PSM.AUTO,
      Tesseract.PSM.SINGLE_COLUMN,
      Tesseract.PSM.SPARSE_TEXT,
      Tesseract.PSM.SINGLE_BLOCK,
    ] as const;
    let merged: Partial<ExtractionResult> = {};
    let previewText = '';
    let confidence: number | null = null;
    const psmsUsed: string[] = [];
    try {
      for (const psm of psms) {
        await worker.setParameters({
          tessedit_pageseg_mode: psm,
          preserve_interword_spaces: '1',
        });
        const res = await worker.recognize(image);
        this.logTesseractRecognizeSnapshot(`langs=${langs} psm=${String(psm)}`, {
          jobId: res.jobId,
          data: res.data as unknown as Record<string, unknown>,
        });
        const t = res?.data?.text ?? '';
        if (!previewText && t.trim()) {
          previewText = t;
        }
        if (confidence === null && res?.data?.confidence != null) {
          confidence = res.data.confidence;
        }
        const next = this.parseTextContent(t);
        merged =
          Object.keys(merged).length === 0
            ? next
            : this.mergePartialExtraction(merged, next);
        psmsUsed.push(String(psm));
        if ((merged.lineItems?.length ?? 0) >= this.OCR_LINE_ITEMS_STOP_AT) {
          break;
        }
      }
      return { merged, previewText, confidence, psmsUsed };
    } finally {
      await worker.terminate();
    }
  }

  private async parseImage(buffer: Buffer): Promise<Partial<ExtractionResult>> {
    const { buffer: ocrBuffer, applied: preprocessApplied, error: preprocessError } =
      await preprocessImageForOcr(buffer);

    const initial = await this.extractFromImageWithAdaptivePsm(ocrBuffer, OCR_INITIAL_LANGS);
    let text = initial.previewText;
    let confidence = initial.confidence;
    let parsed = initial.merged;

    const refinedLang = detectTesseractRefinementLang(text);
    let refinedApplied = false;

    if (refinedLang) {
      try {
        const refined = await this.extractFromImageWithAdaptivePsm(ocrBuffer, refinedLang);
        const t2 = refined.previewText;
        const c2 = refined.confidence;
        const len1 = text.trim().length;
        const len2 = t2.trim().length;
        const longEnough = len2 >= 10;
        const notMuchWorse = len1 === 0 || len2 >= len1 * 0.4 || len2 > len1;
        if (longEnough && notMuchWorse) {
          parsed = this.mergePartialExtraction(parsed, refined.merged);
          text = t2;
          confidence = c2 ?? confidence;
          refinedApplied = true;
        }
      } catch {}
    }

    let englishFallbackApplied = false;
    let englishTextPreview: string | undefined;
    if (this.shouldRunEnglishOcrFallback(text, parsed)) {
      try {
        const eng = await this.extractFromImageWithAdaptivePsm(ocrBuffer, 'eng');
        const engText = eng.previewText;
        if (engText.replace(/\s+/g, ' ').trim().length >= 25) {
          parsed = this.mergePartialExtraction(parsed, eng.merged);
          englishFallbackApplied = true;
          englishTextPreview = engText.slice(0, 1500);
        }
      } catch {}
    }

    const parsedLineItemRows = parsed.lineItems?.length ?? 0;
    console.log('[documents.parseImage] parsed table / line-item rows from OCR text', {
      lineItemRows: parsedLineItemRows,
    });

    return {
      ...parsed,
      rawExtractedData: {
        ...(parsed.rawExtractedData ?? {}),
        source: 'image',
        confidence,
        ocrImagePreprocessed: preprocessApplied,
        ocrPreprocessError: preprocessError,
        ocrInitialLangs: OCR_INITIAL_LANGS,
        ocrPsmAdaptive: initial.psmsUsed.join(','),
        ocrRefinedLang: refinedLang ?? undefined,
        ocrRefinedApplied: refinedApplied,
        ocrEnglishFallbackApplied: englishFallbackApplied,
        ocrEnglishFallbackPreview: englishTextPreview,
      },
      ingestionNotes: text.trim()
        ? refinedApplied
          ? `OCR (${refinedLang}) refined after language detection. Please review recognized values.`
          : 'OCR extracted text from image. Please review recognized values.'
        : 'OCR did not detect enough text. Please review and enter data manually.',
    };
  }

  private shouldRunEnglishOcrFallback(
    ocrText: string,
    parsed: Partial<ExtractionResult>,
  ): boolean {
    const compact = ocrText.replace(/\s+/g, ' ').trim();
    if (compact.length < 40) {
      return true;
    }
    const noTotals = parsed.total == null && parsed.subtotal == null;
    const noLines = !parsed.lineItems?.length;
    const weakMeta =
      parsed.currency == null ||
      parsed.issueDate == null ||
      parsed.total == null ||
      parsed.subtotal == null;
    return (noTotals && noLines) || (noLines && weakMeta);
  }

  private pickRicherLineItems(a: ExtractedLineItem[], b: ExtractedLineItem[]): ExtractedLineItem[] {
    if (b.length > a.length) {
      return b;
    }
    if (a.length > b.length) {
      return a;
    }
    const score = (xs: ExtractedLineItem[]) =>
      xs.reduce((s, li) => s + li.description.replace(/\s+/g, '').length, 0);
    return score(b) >= score(a) ? b : a;
  }

  private mergePartialExtraction(
    primary: Partial<ExtractionResult>,
    secondary: Partial<ExtractionResult>,
  ): Partial<ExtractionResult> {
    const pLines = primary.lineItems ?? [];
    const sLines = secondary.lineItems ?? [];
    const pickLines = this.pickRicherLineItems(pLines, sLines);

    return {
      ...primary,
      documentType: primary.documentType ?? secondary.documentType,
      supplierName: primary.supplierName ?? secondary.supplierName,
      documentNumber: primary.documentNumber ?? secondary.documentNumber,
      issueDate: primary.issueDate ?? secondary.issueDate,
      dueDate: primary.dueDate ?? secondary.dueDate,
      currency: primary.currency ?? secondary.currency,
      subtotal: primary.subtotal ?? secondary.subtotal,
      tax: primary.tax ?? secondary.tax,
      total: primary.total ?? secondary.total,
      lineItems: pickLines ?? [],
      rawExtractedData: {
        ...(typeof primary.rawExtractedData === 'object' && primary.rawExtractedData
          ? primary.rawExtractedData
          : {}),
        ...(typeof secondary.rawExtractedData === 'object' && secondary.rawExtractedData
          ? secondary.rawExtractedData
          : {}),
      },
    };
  }

  private parseCsv(content: string): Partial<ExtractionResult> {
    const lines = content
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return {};
    }

    const rows = lines.map((l) => this.splitCsvLine(l));
    const header = rows[0].map((c) => c.toLowerCase().trim());
    const meta: Record<string, string> = {};

    const pick = (aliases: string[]): string | undefined => {
      const i = this.findCsvColumnAny(header, aliases);
      if (i >= 0 && rows[1]?.[i] !== undefined) {
        return rows[1][i]?.trim();
      }
      return undefined;
    };

    const pickFooterMoney = (aliases: string[]): string | undefined => {
      const i = this.findCsvColumnAny(header, aliases);
      if (i < 0) {
        return undefined;
      }
      if (rows.length > 3) {
        for (let r = rows.length - 1; r >= 2; r--) {
          const v = rows[r]?.[i]?.trim();
          if (v && /\d/.test(v)) {
            return v;
          }
        }
      }
      return rows[1]?.[i]?.trim();
    };

    const hasMetaHeader =
      META_ALIASES.supplier.some((a) => this.findCsvColumnAny(header, [a]) >= 0) ||
      META_ALIASES.documentNumber.some((a) => this.findCsvColumnAny(header, [a]) >= 0) ||
      header.includes('supplier_name') ||
      header.includes('document_number') ||
      header.includes('invoice_number');

    const dIdx = this.findCsvColumnAny(header, CSV_COLUMN_ALIASES.description);
    const qIdx = this.findCsvColumnAny(header, CSV_COLUMN_ALIASES.quantity);
    const uIdx = this.findCsvColumnAny(header, CSV_COLUMN_ALIASES.unitPrice);
    const ltIdx = this.findCsvColumnAny(header, CSV_COLUMN_ALIASES.lineTotal);
    const hasLineColumns = dIdx >= 0 && qIdx >= 0 && uIdx >= 0;

    const mergeStructuredAndLooseRows = (
      structured: ExtractedLineItem[],
      looseStartRow: number,
    ): ExtractedLineItem[] =>
      this.dedupeLineItems([
        ...structured,
        ...this.extractLooseCsvLineItems(rows, looseStartRow),
      ]);

    if (hasMetaHeader) {
      if (rows.length > 1) {
        meta.supplier_name = pick(META_ALIASES.supplier) ?? pick(['supplier_name', 'supplier']) ?? '';
        meta.document_number =
          pick(META_ALIASES.documentNumber) ??
          pick(['document_number', 'invoice_number', 'po_number', 'purchase_order_number']) ??
          '';
        meta.currency = pick(META_ALIASES.currency) ?? pick(['currency']) ?? '';
        meta.issue_date = pick(META_ALIASES.issueDate) ?? pick(['issue_date', 'issued']) ?? '';
        meta.due_date =
          pick(META_ALIASES.dueDate) ??
          pick(['due_date', 'due', 'datum_valute', 'rok_placanja', 'datum_dospijeca']) ??
          '';
        meta.subtotal =
          pickFooterMoney(META_ALIASES.subtotal) ?? pick(['subtotal', 'sub_total']) ?? '';
        meta.tax = pickFooterMoney(META_ALIASES.tax) ?? pick(['tax', 'vat']) ?? '';
        meta.total =
          pickFooterMoney(META_ALIASES.total) ?? pick(['total', 'amount', 'grand_total']) ?? '';
        const dt =
          pick(['document_type', 'type'])?.toLowerCase() ??
          (header.some((h) => h.includes('purchase') && h.includes('order')) ? 'purchase_order' : '');
        meta.document_type =
          dt.includes('purchase') || dt === 'po' ? 'purchase_order' : 'invoice';

        const structured =
          hasLineColumns && rows.length > 2
            ? this.extractCsvLineItems(rows, dIdx, qIdx, uIdx, ltIdx, 2)
            : [];
        const lineItems =
          rows.length > 2 ? mergeStructuredAndLooseRows(structured, 2) : structured;

        return this.buildFromMetaRecord(meta, lineItems);
      }
    }

    if (hasLineColumns && rows.length > 1) {
      const structured = this.extractCsvLineItems(rows, dIdx, qIdx, uIdx, ltIdx, 1);
      const lineItems = mergeStructuredAndLooseRows(structured, 1);
      return this.buildFromMetaRecord(meta, lineItems);
    }

    const looseOnly = this.extractLooseCsvLineItems(rows, 0);
    if (looseOnly.length > 0) {
      return this.buildFromMetaRecord(meta, looseOnly);
    }

    const kv: Record<string, string> = {};
    for (const row of rows) {
      if (row.length >= 2) {
        const k = row[0].replace(/^"|"$/g, '').trim().toLowerCase().replace(/\s+/g, '_');
        const v = row.slice(1).join(',').replace(/^"|"$/g, '').trim();
        if (k && v) {
          kv[k] = v;
        }
      }
    }
    if (Object.keys(kv).length > 0) {
      const looseFromKv = this.extractLooseCsvLineItems(rows, 0);
      return this.buildFromMetaRecord(kv, looseFromKv);
    }

    return {};
  }

  private dedupeLineItems(items: ExtractedLineItem[]): ExtractedLineItem[] {
    const seen = new Set<string>();
    const out: ExtractedLineItem[] = [];
    for (const li of items) {
      const key = `${li.description}\t${li.quantity}\t${li.unitPrice}\t${li.lineTotal}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(li);
    }
    return out;
  }

  private extractCsvLineItems(
    rows: string[][],
    dIdx: number,
    qIdx: number,
    uIdx: number,
    ltIdx: number,
    startRow: number,
  ): ExtractedLineItem[] {
    const lineItems: ExtractedLineItem[] = [];
    if (dIdx < 0 || qIdx < 0 || uIdx < 0 || startRow >= rows.length) {
      return lineItems;
    }
    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      const description = row[dIdx]?.trim() ?? '';
      if (!description) {
        continue;
      }
      const quantity = Number(row[qIdx]?.replace(',', '.') ?? 0) || 0;
      const unitPrice = Number(row[uIdx]?.replace(',', '.') ?? 0) || 0;
      const lineTotal = Number(
        ltIdx >= 0 ? row[ltIdx]?.replace(',', '.') : quantity * unitPrice,
      );
      lineItems.push({
        description,
        quantity,
        unitPrice,
        lineTotal: Number.isFinite(lineTotal) ? lineTotal : quantity * unitPrice,
      });
    }
    return lineItems;
  }

  private extractLooseCsvLineItems(rows: string[][], startRow: number): ExtractedLineItem[] {
    const out: ExtractedLineItem[] = [];
    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      const li = this.tryParseLooseCsvLineRow(row);
      if (li) {
        out.push(li);
      }
    }
    return out;
  }

  private tryParseLooseCsvLineRow(cells: string[]): ExtractedLineItem | null {
    if (!cells?.length || cells.length < 3) {
      return null;
    }
    const trimmed = cells.map((c) => c.trim());
    for (const want of [3, 2] as const) {
      if (trimmed.length <= want) {
        continue;
      }
      const suffix = trimmed.slice(-want);
      const nums = suffix.map((s) => this.parseMoneyToken(s));
      if (!nums.every((n) => n !== null && Number.isFinite(n))) {
        continue;
      }
      const a = nums[0]!;
      const b = nums[1]!;
      const lineTotal = want === 3 ? nums[2]! : a * b;
      const descParts = trimmed.slice(0, trimmed.length - want).filter(Boolean);
      let description = descParts.join(', ').trim().replace(/^\d+\s+/, '');
      if (description.length < 2) {
        continue;
      }
      if (LOOSE_ROW_SKIP.test(description)) {
        return null;
      }
      const qp = this.inferQuantityAndUnitPrice(a, b, lineTotal);
      if (!qp) {
        continue;
      }
      const lt = want === 3 ? lineTotal : qp.quantity * qp.unitPrice;
      return {
        description,
        quantity: qp.quantity,
        unitPrice: qp.unitPrice,
        lineTotal: Number.isFinite(lt) ? lt : qp.quantity * qp.unitPrice,
      };
    }
    return null;
  }

  private buildFromMetaRecord(
    meta: Record<string, string>,
    lineItems: ExtractedLineItem[],
  ): Partial<ExtractionResult> {
    const docTypeRaw = (meta.document_type ?? meta.type ?? '').toLowerCase();
    let documentType: DocumentType | null =
      docTypeRaw.includes('purchase') || docTypeRaw === 'po'
        ? DocumentType.PURCHASE_ORDER
        : docTypeRaw.includes('invoice') || docTypeRaw === 'invoice'
          ? DocumentType.INVOICE
          : null;

    const sn = pickMeta(meta, META_ALIASES.supplier);
    const dn = pickMeta(meta, META_ALIASES.documentNumber);

    return {
      documentType,
      supplierName: sn ?? null,
      documentNumber: dn ?? null,
      issueDate: this.parseDate(pickMeta(meta, META_ALIASES.issueDate)),
      dueDate: this.parseDate(pickMeta(meta, META_ALIASES.dueDate)),
      currency: (pickMeta(meta, META_ALIASES.currency) ?? '').toUpperCase() || null,
      subtotal: this.parseNum(pickMeta(meta, META_ALIASES.subtotal)),
      tax: this.parseNum(pickMeta(meta, META_ALIASES.tax)),
      total: this.parseNum(pickMeta(meta, META_ALIASES.total)),
      lineItems,
      rawExtractedData: { meta },
    };
  }

  private parseTextContent(text: string): Partial<ExtractionResult> {
    const t = text.replace(/\r/g, '\n');
    const meta: Record<string, string> = {};
    const kvLine = /^\s*([^:\n]+)\s*:\s*(.+)$/gim;
    let m: RegExpExecArray | null;
    while ((m = kvLine.exec(t)) !== null) {
      const k = m[1].trim().toLowerCase().replace(/\s+/g, '_');
      meta[k] = m[2].trim();
    }

    const issueDateNoColon =
      /^\s*(?:invoice\s*date|issue\s*date|date)\s+(.+)$/gim;
    while ((m = issueDateNoColon.exec(t)) !== null) {
      const v = m[1].trim();
      if (v && captureLooksLikeDate(v)) {
        meta.issue_date = v;
        meta.date = meta.date ?? v;
        break;
      }
    }

    const looseSupplier = extractSupplierLoose(t);
    if (!meta.supplier && !meta.supplier_name && looseSupplier) {
      meta.supplier = looseSupplier;
    }
    if (!meta.number && !meta.document_number) {
      const invLoose = extractInvoiceNumberLoose(t);
      const poLoose = extractPoNumberLoose(t);
      const hint = classifyDocTypeHint(t);
      if (hint === 'PURCHASE_ORDER' && poLoose) {
        meta.number = poLoose;
      } else if (invLoose) {
        meta.number = invLoose;
      } else if (poLoose) {
        meta.number = poLoose;
      }
    }

    const inv = /invoice\s*#?\s*[:.]?\s*([A-Z0-9\-_/]+)/i.exec(t);
    const po = /(?:purchase\s*order|P\.?O\.?)\s*#?\s*[:.]?\s*([A-Z0-9\-_/]+)/i.exec(t);
    let docNum =
      pickMeta(meta, META_ALIASES.documentNumber) ||
      meta.number ||
      meta.document_number ||
      meta.invoice_number ||
      meta.po_number ||
      inv?.[1] ||
      po?.[1] ||
      extractInvoiceNumberLoose(t) ||
      extractPoNumberLoose(t);

    let documentType = po
      ? DocumentType.PURCHASE_ORDER
      : inv
        ? DocumentType.INVOICE
        : meta.document_type?.toLowerCase().includes('purchase')
          ? DocumentType.PURCHASE_ORDER
          : meta.document_type?.toLowerCase().includes('invoice')
            ? DocumentType.INVOICE
            : null;

    const langHint = classifyDocTypeHint(t);
    if (!documentType && langHint === 'INVOICE') {
      documentType = DocumentType.INVOICE;
    }
    if (!documentType && langHint === 'PURCHASE_ORDER') {
      documentType = DocumentType.PURCHASE_ORDER;
    }

    const money = extractMoneyAfterLabels(t);
    const footer = extractInvoiceFooterAmountsLoose(t);

    let total =
      this.parseNum(pickMeta(meta, META_ALIASES.total)) ??
      this.parseNum(meta.grand_total) ??
      this.parseMoney(money.total) ??
      this.parseGrandTotalLoose(t);
    if (total == null) {
      total = this.parseMoney(footer.total);
    }

    let sub =
      this.parseNum(pickMeta(meta, META_ALIASES.subtotal)) ??
      this.parseMoney(money.subtotal) ??
      this.parseMoney(/subtotal\s*[:.]?\s*([\d.,]+)/i.exec(t)?.[1]);
    if (sub == null) {
      sub = this.parseMoney(footer.subtotal);
    }

    let tax =
      this.parseNum(pickMeta(meta, META_ALIASES.tax)) ??
      this.parseMoney(money.tax) ??
      this.parseMoney(/tax\s*(?:\([^)]*\))?\s*[:.]?\s*([\d.,]+)/i.exec(t)?.[1]);
    if (tax == null) {
      tax = this.parseMoney(footer.tax);
    }

    let issueRaw =
      pickMeta(meta, META_ALIASES.issueDate) ||
      meta.date ||
      meta.issued ||
      extractIssueDateLoose(t);
    if (!issueRaw) {
      issueRaw = extractAnyNumericDateLoose(t);
    }
    const dueRaw = pickMeta(meta, META_ALIASES.dueDate) || meta.due || extractDueDateLoose(t);

    const tableStyleRows = this.extractLineItemsFromDescriptionColumnTable(t);
    const regexTableRows = this.extractLineItemsFromRegexTableRows(t);
    const scannedTriples = this.extractLineItemsByScanningMoneyTriples(t);
    const looseCombined = this.dedupeLineItems([
      ...this.extractAllLooseLineItemsFromText(t),
      ...this.extractPermissiveMoneyLineItems(t),
    ]);
    let lineItems = this.mergeLineItemExtractionCandidates([
      { items: tableStyleRows, preferOnTie: true },
      { items: regexTableRows, preferOnTie: true },
      { items: scannedTriples, preferOnTie: false },
      { items: looseCombined, preferOnTie: false },
    ]);

    let cur = pickMeta(meta, META_ALIASES.currency) || extractCurrencyLoose(t) || '';
    if (!cur && /\$/m.test(t)) {
      cur = 'USD';
    }

  
    return {
      documentType: docNum ? documentType : null,
      supplierName:
        pickMeta(meta, META_ALIASES.supplier) || meta.vendor || meta.from || looseSupplier || null,
      documentNumber: docNum ?? null,
      issueDate: this.parseDate(issueRaw),
      dueDate: this.parseDate(dueRaw),
      currency: cur ? cur.toUpperCase() : null,
      subtotal: sub,
      tax,
      total,
      lineItems,
      rawExtractedData: { textSnippet: t.slice(0, 2000) },
    };
  }

  private extractAllLooseLineItemsFromText(t: string): ExtractedLineItem[] {
    return this.dedupeLineItems([
      ...this.parseLoosePdfLineRows(t),
      ...this.parseLooseCommaSeparatedLineRows(t),
      ...this.parseLooseTabSemicolonLineRows(t),
    ]);
  }

  /** When OCR splits one table row across two lines, merge so tryParseTableStyleInvoiceRow can succeed. */
  private mergeContinuationLinesForInvoiceTable(lines: string[]): string[] {
    const out: string[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!.replace(/\s+/g, ' ').trim();
      const next = i + 1 < lines.length ? lines[i + 1]!.replace(/\s+/g, ' ').trim() : '';
      const combined = `${line} ${next}`.trim();
      if (
        next &&
        !this.tryParseTableStyleInvoiceRow(line) &&
        this.tryParseTableStyleInvoiceRow(combined)
      ) {
        out.push(combined);
        i += 2;
        continue;
      }
      out.push(line);
      i += 1;
    }
    return out;
  }

  private filterGarbageLineItems(items: ExtractedLineItem[]): ExtractedLineItem[] {
    return items.filter((li) => {
      const d = li.description.replace(/\s+/g, ' ').trim();
      if (d.length < 2) {
        return false;
      }
      if (/^(sub\s*total|subtotal|grand\s*total|amount\s*due)\b/i.test(d)) {
        return false;
      }
      if (/^vat\b/i.test(d) && /\bof\b/i.test(d)) {
        return false;
      }
      if (/^total\s+[£€$]?[\d.,]*\s*$/i.test(d)) {
        return false;
      }
      return true;
    });
  }

  /** Union candidates from every strategy (deduped); catches rows when one strategy finds 2 and another finds the rest. */
  private mergeLineItemExtractionCandidates(
    candidates: Array<{ items: ExtractedLineItem[]; preferOnTie: boolean }>,
  ): ExtractedLineItem[] {
    const sorted = [...candidates].sort((a, b) => {
      const ld = b.items.length - a.items.length;
      if (ld !== 0) {
        return ld;
      }
      return (b.preferOnTie ? 1 : 0) - (a.preferOnTie ? 1 : 0);
    });
    const merged = this.dedupeLineItems(sorted.flatMap((c) => c.items));
    const filtered = this.filterGarbageLineItems(merged);
    return filtered.length > 0 ? filtered : merged;
  }

  private extractLineItemsFromDescriptionColumnTable(text: string): ExtractedLineItem[] {
    let lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    lines = this.mergeContinuationLinesForInvoiceTable(lines);
    const headerIdx = lines.findIndex((l) => this.looksLikeInvoiceLineItemsHeader(l));
    const footerRe =
      /^(sub\s*total|subtotal|total\s+(?:gbp|eur|usd)?|grand\s*total|amount\s*due)\b/i;

    const parseRows = (start: number, stopAtFooter: boolean): ExtractedLineItem[] => {
      const out: ExtractedLineItem[] = [];
      for (let i = start; i < lines.length; i++) {
        const line = lines[i]!;
        if (stopAtFooter && footerRe.test(line)) {
          break;
        }
        if (LOOSE_ROW_SKIP.test(line)) {
          continue;
        }
        const li = this.tryParseTableStyleInvoiceRow(line);
        if (li) {
          out.push(li);
        }
      }
      return out;
    };

    if (headerIdx >= 0) {
      return parseRows(headerIdx + 1, true);
    }

    const unconstrained = parseRows(0, false);
    return unconstrained.length >= 2 ? unconstrained : [];
  }

  private looksLikeInvoiceLineItemsHeader(line: string): boolean {
    const l = line.toLowerCase();
    const hasDesc =
      /\b(desc|description|item|product|service|details)\b/i.test(l) ||
      /\bdescr/i.test(l);
    const hasQty = /\b(qty|quantity|qt\.|qt\b|menge|cantidad)\b/i.test(l);
    const hasMoneyCol =
      /\b(price|rate|unit|amount|total|sum|amt)\b/i.test(l) ||
      /\b(vat|btw|mwst)\b/i.test(l);
    return hasDesc && hasQty && hasMoneyCol;
  }

  private tryParseTableStyleInvoiceRow(line: string): ExtractedLineItem | null {
    let s = line.replace(/\s+/g, ' ').trim();
    if (s.length < 5) {
      return null;
    }

    let m = s.match(/(\d[\d,'’]*[.,]?\d*)\s*$/);
    if (!m) {
      return null;
    }
    const lineTotal = this.parseMoneyToken((m[1] ?? '').replace(/'/g, ''));
    if (lineTotal === null || lineTotal <= 0) {
      return null;
    }
    s = s.slice(0, s.length - m[0].length).trim();

    m = s.match(/(\d{1,3})\s*%\s*$/);
    if (m) {
      s = s.slice(0, s.length - m[0].length).trim();
    }

    m = s.match(/(\d[\d,'’]*[.,]?\d*)\s*$/);
    if (!m) {
      return null;
    }
    const unitPrice = this.parseMoneyToken((m[1] ?? '').replace(/'/g, ''));
    if (unitPrice === null || unitPrice <= 0) {
      return null;
    }
    s = s.slice(0, s.length - m[0].length).trim();

    m = s.match(
      /(?:each|ea\b|pcs\.?|pc\.?|box|pack|kg|g\b|m\b|hr\b|days?|hours?)\s*$/i,
    );
    if (m) {
      s = s.slice(0, s.length - m[0].length).trim();
    }

    m = s.match(/(\d+)\s*$/);
    if (!m) {
      return null;
    }
    const quantity = Number(m[1]);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 500_000) {
      return null;
    }
    s = s.slice(0, s.length - m[0].length).trim();

    const description = s
      .replace(/^[,.\s:-]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (description.length < 2 || LOOSE_ROW_SKIP.test(description)) {
      return null;
    }
    if (/^(sub\s*total|subtotal|tax|vat|total|grand|shipping)\b/i.test(description)) {
      return null;
    }

    const expected = quantity * unitPrice;
    if (
      Math.abs(expected - lineTotal) >
      Math.max(LINE_ITEM_EPS, 0.02 * Math.max(lineTotal, expected, 1))
    ) {
      return null;
    }

    return { description, quantity, unitPrice, lineTotal };
  }

  private extractLineItemsFromRegexTableRows(text: string): ExtractedLineItem[] {
    const blob = this.extractLineItemsFromRegexTableRowsOnNormalized(
      text.replace(/\r/g, ' ').replace(/\s+/g, ' ').trim(),
    );
    const perLine = text
      .split(/\r?\n/)
      .map((raw) => raw.replace(/\s+/g, ' ').trim())
      .filter((line) => line.length >= 12)
      .flatMap((line) => this.extractLineItemsFromRegexTableRowsOnNormalized(line));
    return this.dedupeLineItems([...blob, ...perLine]);
  }

  private extractLineItemsFromRegexTableRowsOnNormalized(normalized: string): ExtractedLineItem[] {
    if (normalized.length < 12) {
      return [];
    }
    const out: ExtractedLineItem[] = [];
    const withEach =
      /\b([A-Za-z][A-Za-z0-9\s'’`&.,()/-]{1,120}?)\s+(\d{1,6})\s+each\s+([\d,'’]+(?:[.,]\d{1,2})?)\s+(?:(\d{1,3})\s*%\s+)?([\d,'’]+(?:[.,]\d{1,2})?)/gi;
    const noEach =
      /\b([A-Za-z][A-Za-z0-9\s'’`&.,()/-]{1,120}?)\s+(\d{1,6})\s+([\d,'’]+(?:[.,]\d{1,2})?)\s+(?:(\d{1,3})\s*%\s+)?([\d,'’]+(?:[.,]\d{1,2})?)/gi;

    const pushMatch = (m: RegExpExecArray) => {
      const description = (m[1] ?? '').replace(/\s+/g, ' ').trim();
      const quantity = Number(m[2]);
      const unitPriceRaw = m[3];
      const lineTotalRaw = m[5] ?? m[4];
      const lineTotal = this.parseMoneyToken((lineTotalRaw ?? '').replace(/'/g, ''));
      const unitPrice = this.parseMoneyToken((unitPriceRaw ?? '').replace(/'/g, ''));
      if (
        !description ||
        description.length < 2 ||
        LOOSE_ROW_SKIP.test(description) ||
        /^(sub\s*total|total|vat)\b/i.test(description)
      ) {
        return;
      }
      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        lineTotal === null ||
        unitPrice === null ||
        unitPrice <= 0
      ) {
        return;
      }
      const expected = quantity * unitPrice;
      if (
        Math.abs(expected - lineTotal) >
        Math.max(LINE_ITEM_EPS, 0.02 * Math.max(lineTotal, expected, 1))
      ) {
        return;
      }
      out.push({ description, quantity, unitPrice, lineTotal });
    };

    let m: RegExpExecArray | null;
    while ((m = withEach.exec(normalized)) !== null) {
      pushMatch(m);
    }
    noEach.lastIndex = 0;
    while ((m = noEach.exec(normalized)) !== null) {
      pushMatch(m);
    }

    return this.dedupeLineItems(out);
  }

  private looksLikeVatPercentToken(v: number): boolean {
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      return false;
    }
    return Math.abs(v - Math.round(v)) < 1e-6 || Math.abs(v * 100 - Math.round(v * 100)) < 1e-3;
  }

  private extractPermissiveMoneyLineItems(t: string): ExtractedLineItem[] {
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out: ExtractedLineItem[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!;
      if (LOOSE_ROW_SKIP.test(line)) {
        i++;
        continue;
      }
      let best: ExtractedLineItem | null = null;
      let bestEnd = i;
      let merged = '';
      for (let k = 0; k < 10 && i + k < lines.length; k++) {
        const piece = lines[i + k]!;
        if (k > 0 && LOOSE_ROW_SKIP.test(piece)) {
          break;
        }
        merged = k === 0 ? piece : `${merged} ${piece}`;
        const li = this.tryParsePermissiveLineItem(merged);
        if (li) {
          best = li;
          bestEnd = i + k;
        }
      }
      if (best) {
        out.push(best);
        i = bestEnd + 1;
      } else {
        i++;
      }
    }
    return this.dedupeLineItems(out);
  }

  private tryParsePermissiveLineItem(line: string): ExtractedLineItem | null {
    const normalized = line.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/[a-zA-Z]{2,}/.test(normalized)) {
      return null;
    }
    const re = /(?:\$|€|£)?\s*(\d[\d,'’]*[.,]?\d*)/g;
    const hits: { index: number; raw: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(normalized)) !== null) {
      const raw = (m[1] ?? '').replace(/'/g, '');
      hits.push({ index: m.index, raw });
    }
    if (hits.length < 3) {
      return null;
    }
    const last3 = hits.slice(-3);
    const nums = last3
      .map((h) => this.parseMoneyToken(h.raw))
      .filter((n): n is number => n !== null && Number.isFinite(n));
    if (nums.length !== 3) {
      return null;
    }
    const [a, b, c] = nums;
    const orderings: Array<[number, number, number]> = [
      [a, b, c],
      [a, c, b],
      [b, a, c],
      [b, c, a],
      [c, a, b],
      [c, b, a],
    ];
    for (const [x, y, z] of orderings) {
      const qp = this.inferQuantityAndUnitPrice(x, y, z);
      if (!qp) {
        continue;
      }
      const start = last3[0]!.index;
      let description = normalized.slice(0, start).trim();
      description = description
        .replace(/^\d+\s+/, '')
        .replace(/^[slno#\.\s]+\s*/i, '')
        .trim();
      if (description.length < 2 || LOOSE_ROW_SKIP.test(description)) {
        return null;
      }
      if (/^(sub\s*total|subtotal|tax|vat|tva|total|grand\s*total|amount\s*due)\b/i.test(description)) {
        return null;
      }
      return {
        description,
        quantity: qp.quantity,
        unitPrice: qp.unitPrice,
        lineTotal: z,
      };
    }
    return null;
  }

  private extractLineItemsByScanningMoneyTriples(text: string): ExtractedLineItem[] {
    const normalized = text.replace(/\r/g, '\n').replace(/\s+/g, ' ').trim();
    if (normalized.length < 6) {
      return [];
    }
    const tokens = this.collectMoneyTokensWithSpans(normalized);
    const out: ExtractedLineItem[] = [];
    let descStart = 0;
    let i = 0;
    while (i + 2 < tokens.length) {
      if (i + 3 < tokens.length) {
        const vatCand = tokens[i + 2]!.value;
        if (this.looksLikeVatPercentToken(vatCand)) {
          const a = tokens[i]!.value;
          const b = tokens[i + 1]!.value;
          const d = tokens[i + 3]!.value;
          const quad = this.tryThreeAmountsAsLineItem(a, b, d);
          if (quad && this.isPlausibleLineProductAmounts(quad)) {
            const rawDesc = normalized
              .slice(descStart, tokens[i]!.start)
              .trim()
              .replace(/^[,.\s:-]+/, '');
            if (
              rawDesc.length > 0 &&
              /^(sub\s*total|subtotal|tax|vat|tva|discount|grand\s*total|amount\s*due)\b/i.test(
                rawDesc,
              )
            ) {
              i++;
              continue;
            }
            const description =
              rawDesc.length >= 2 && !LOOSE_ROW_SKIP.test(rawDesc)
                ? rawDesc
                : rawDesc.length > 0
                  ? rawDesc
                  : `Line ${out.length + 1}`;
            out.push({
              description,
              quantity: quad.quantity,
              unitPrice: quad.unitPrice,
              lineTotal: quad.lineTotal,
            });
            descStart = tokens[i + 3]!.end;
            i += 4;
            continue;
          }
        }
      }

      const a = tokens[i]!.value;
      const b = tokens[i + 1]!.value;
      const c = tokens[i + 2]!.value;
      const amounts = this.tryThreeAmountsAsLineItem(a, b, c);
      if (amounts && this.isPlausibleLineProductAmounts(amounts)) {
        const rawDesc = normalized
          .slice(descStart, tokens[i]!.start)
          .trim()
          .replace(/^[,.\s:-]+/, '');
        if (
          rawDesc.length > 0 &&
          /^(sub\s*total|subtotal|tax|vat|tva|discount|grand\s*total|amount\s*due)\b/i.test(rawDesc)
        ) {
          i++;
          continue;
        }
        const description =
          rawDesc.length >= 2 && !LOOSE_ROW_SKIP.test(rawDesc)
            ? rawDesc
            : rawDesc.length > 0
              ? rawDesc
              : `Line ${out.length + 1}`;
        out.push({
          description,
          quantity: amounts.quantity,
          unitPrice: amounts.unitPrice,
          lineTotal: amounts.lineTotal,
        });
        descStart = tokens[i + 2]!.end;
        i += 3;
        continue;
      }
      i++;
    }
    return out;
  }

  private tryThreeAmountsAsLineItem(
    a: number,
    b: number,
    c: number,
  ): Pick<ExtractedLineItem, 'quantity' | 'unitPrice' | 'lineTotal'> | null {
    const orderings: Array<[number, number, number]> = [
      [a, b, c],
      [a, c, b],
      [b, a, c],
      [b, c, a],
      [c, a, b],
      [c, b, a],
    ];
    for (const [x, y, z] of orderings) {
      const qp = this.inferQuantityAndUnitPrice(x, y, z);
      if (qp) {
        return {
          quantity: qp.quantity,
          unitPrice: qp.unitPrice,
          lineTotal: z,
        };
      }
    }
    return null;
  }

  private collectMoneyTokensWithSpans(
    text: string,
  ): Array<{ start: number; end: number; value: number }> {
    const re = /(?:\$|€|£)?\s*(\d[\d,'’]*[.,]?\d*)/g;
    const out: Array<{ start: number; end: number; value: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = (m[1] ?? '').replace(/'/g, '');
      const v = this.parseMoneyToken(raw);
      if (v === null || !Number.isFinite(v)) {
        continue;
      }
      out.push({ start: m.index, end: m.index + m[0].length, value: v });
    }
    return out;
  }

  private isPlausibleLineProductAmounts(
    li: Pick<ExtractedLineItem, 'quantity' | 'unitPrice' | 'lineTotal'>,
  ): boolean {
    const q = li.quantity;
    const u = li.unitPrice;
    const lt = li.lineTotal;
    if (q <= 0 || u <= 0 || lt <= 0) {
      return false;
    }
    if (q > 50_000 || u > 5_000_000 || lt > 50_000_000) {
      return false;
    }
    if (q >= 2000 && u < 2) {
      return false;
    }
    if (u < 0.05 && q > 500) {
      return false;
    }
    return true;  }

  private parseLoosePdfLineRows(t: string): ExtractedLineItem[] {
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out: ExtractedLineItem[] = [];
    for (const line of lines) {
      if (LOOSE_ROW_SKIP.test(line)) {
        continue;
      }
      const m = line.match(/^(.+?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/);
      if (!m) {
        continue;
      }
      let description = m[1].trim().replace(/^\d+\s+/, '');
      if (LOOSE_ROW_SKIP.test(description) || description.length < 2) {
        continue;
      }
      const a = Number(m[2].replace(',', '.'));
      const b = Number(m[3].replace(',', '.'));
      const lineTotal = Number(m[4].replace(',', '.'));
      if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(lineTotal)) {
        continue;
      }
      const qp = this.inferQuantityAndUnitPrice(a, b, lineTotal);
      if (!qp) {
        continue;
      }
      out.push({ description, quantity: qp.quantity, unitPrice: qp.unitPrice, lineTotal });
    }
    return out;
  }

  private inferQuantityAndUnitPrice(
    first: number,
    second: number,
    lineTotal: number,
  ): { quantity: number; unitPrice: number } | null {
    if (Math.abs(first * second - lineTotal) > LINE_ITEM_EPS) {
      return null;
    }
    const d1 = this.hasMoneyLikeDecimals(first);
    const d2 = this.hasMoneyLikeDecimals(second);
    if (d1 && !d2) {
      return { quantity: second, unitPrice: first };
    }
    if (d2 && !d1) {
      return { quantity: first, unitPrice: second };
    }
    const q1 = this.looksLikeLineQuantity(first);
    const q2 = this.looksLikeLineQuantity(second);
    if (q1 && !q2) {
      return { quantity: first, unitPrice: second };
    }
    if (q2 && !q1) {
      return { quantity: second, unitPrice: first };
    }
    if (q1 && q2) {
      const lo = Math.min(first, second);
      const hi = Math.max(first, second);
      if (hi >= 100 || hi >= lo * 10) {
        return { quantity: lo, unitPrice: hi };
      }
      if (lo <= 10_000 && hi > lo) {
        return { quantity: lo, unitPrice: hi };
      }
    }
    return { quantity: first, unitPrice: second };
  }

  private hasMoneyLikeDecimals(n: number): boolean {
    return Math.abs(n - Math.round(n)) > 1e-6;
  }

  private looksLikeLineQuantity(n: number): boolean {
    if (n <= 0 || n > 500_000) {
      return false;
    }
    return Math.abs(n - Math.round(n)) < 1e-6;
  }

  private parseLooseCommaSeparatedLineRows(t: string): ExtractedLineItem[] {
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out: ExtractedLineItem[] = [];
    for (const line of lines) {
      if (!line.includes(',') || LOOSE_ROW_SKIP.test(line)) {
        continue;
      }
      const li = this.tryParseLooseCsvLineRow(this.splitCsvLine(line));
      if (li) {
        out.push(li);
      }
    }
    return out;
  }

  private parseLooseTabSemicolonLineRows(t: string): ExtractedLineItem[] {
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out: ExtractedLineItem[] = [];
    for (const line of lines) {
      if (LOOSE_ROW_SKIP.test(line)) {
        continue;
      }
      let cells: string[] | null = null;
      if (line.includes('\t')) {
        cells = line.split('\t').map((c) => c.trim());
      } else if (line.includes(';')) {
        cells = line.split(';').map((c) => c.trim());
      }
      if (cells && cells.length >= 3) {
        const li = this.tryParseLooseCsvLineRow(cells);
        if (li) {
          out.push(li);
        }
      }
    }
    return out;
  }

  private parseMoney(s: string | null | undefined): number | null {
    if (s == null || s === '') {
      return null;
    }
    const raw = String(s).trim().replace(/%/g, '').trim();
    for (const token of raw.split(/\s+/)) {
      const n = this.parseMoneyToken(token);
      if (n !== null) {
        return n;
      }
    }
    return this.parseMoneyToken(raw.replace(/\s+/g, ''));
  }

  private parseMoneyToken(token: string): number | null {
    const t = token.replace(/[^\d.,\-+]/g, '');
    if (!t || t === '+' || t === '-') {
      return null;
    }
    let d = t;
    const lastComma = d.lastIndexOf(',');
    const lastDot = d.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) {
        d = d.replace(/\./g, '').replace(',', '.');
      } else {
        d = d.replace(/,/g, '');
      }
    } else if (lastComma >= 0) {
      const after = d.slice(lastComma + 1);
      if (after.length <= 2 && /^\d+$/.test(after)) {
        d = d.replace(',', '.');
      } else {
        d = d.replace(/,/g, '');
      }
    } else if (lastDot >= 0) {
      const after = d.slice(lastDot + 1);
      if (after.length === 3 && /^\d{3}$/.test(after)) {
        d = d.replace(/\./g, '');
      }
    }
    const n = Number(d);
    return Number.isFinite(n) ? n : null;
  }

  private parseGrandTotalLoose(text: string): number | null {
    const re = /(?:grand\s*)?total\s*[:.]?\s*(?:€|£|\$|EUR|USD|GBP|CHF)?\s*([\-+]?\d[\d.,]*)/gi;
    let m: RegExpExecArray | null;
    let last: string | null = null;
    while ((m = re.exec(text)) !== null) {
      last = m[1] ?? null;
    }
    return last ? this.parseMoney(last) : null;
  }

  private parseNum(s: string | undefined): number | null {
    if (s === undefined || s === '') {
      return null;
    }
    const n = Number(String(s).replace(',', '.').replace(/\s/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  private parseDate(s: string | null | undefined): Date | null {
    if (s == null) {
      return null;
    }
    let raw = String(s).trim().replace(/\s+/g, ' ');
    if (!raw) {
      return null;
    }
    raw = raw.replace(/[.,;:]+$/u, '');

    raw = raw.replace(
      /(\d{1,4})\s*([/.-])\s*(\d{1,2})\s*([/.-])\s*(\d{2,4})/,
      (_, d1, s1, d2, s2, y) => `${d1}${s1}${d2}${s2}${y}`,
    );

    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/.exec(raw);
    if (iso) {
      const y = parseInt(iso[1], 10);
      const mo = parseInt(iso[2], 10) - 1;
      const day = parseInt(iso[3], 10);
      const d = new Date(y, mo, day);
      if (d.getFullYear() === y && d.getMonth() === mo && d.getDate() === day) {
        return d;
      }
    }

    const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\D|$)/.exec(raw);
    if (dmy) {
      const day = parseInt(dmy[1], 10);
      const month = parseInt(dmy[2], 10) - 1;
      let year = parseInt(dmy[3], 10);
      if (year < 100) {
        year += year >= 70 ? 1900 : 2000;
      }
      const d = new Date(year, month, day);
      if (!Number.isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === month) {
        return d;
      }
    }

    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  private findCsvColumnIndex(header: string[], alias: string): number {
    const k = alias.toLowerCase().trim();
    for (let i = 0; i < header.length; i++) {
      const cell = header[i].toLowerCase().trim();
      if (cell === k || cell.replace(/\s+/g, '_') === k.replace(/\s+/g, '_')) {
        return i;
      }
    }
    if (k.length < 3) {
      return -1;
    }
    for (let i = 0; i < header.length; i++) {
      const cell = header[i].toLowerCase();
      if (cell.includes(k)) {
        return i;
      }
    }
    return -1;
  }

  private findCsvColumnAny(header: string[], aliases: string[]): number {
    for (const a of aliases) {
      const idx = this.findCsvColumnIndex(header, a);
      if (idx >= 0) {
        return idx;
      }
    }
    return -1;
  }

  private splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQ = !inQ;
        continue;
      }
      if (!inQ && c === ',') {
        out.push(cur.trim());
        cur = '';
        continue;
      }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  }
}
