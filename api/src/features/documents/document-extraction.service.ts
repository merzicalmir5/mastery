import { Injectable } from '@nestjs/common';
import { DocumentSourceType, DocumentType } from '@prisma/client';
import * as fs from 'fs/promises';
import {
  CURRENCY_FINDER,
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
    console.log('[documents.parsePdf] text preview', text.slice(0, 2000));
    return this.parseTextContent(text);
  }

  private async parseImage(buffer: Buffer): Promise<Partial<ExtractionResult>> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { recognize } = require('tesseract.js') as {
      recognize: (
        image: Buffer,
        langs?: string,
      ) => Promise<{ data: { text: string; confidence?: number } }>;
    };
    const result = await recognize(buffer, 'eng');
    const text = result?.data?.text ?? '';
    const confidence = result?.data?.confidence ?? null;
    const parsed = this.parseTextContent(text);
    console.log('[documents.parseImage] text preview', text.slice(0, 2000));
    return {
      ...parsed,
      rawExtractedData: {
        ...(parsed.rawExtractedData ?? {}),
        source: 'image',
        confidence,
      },
      ingestionNotes: text.trim()
        ? 'OCR extracted text from image. Please review recognized values.'
        : 'OCR did not detect enough text. Please review and enter data manually.',
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

    const hasStructuredHeader =
      META_ALIASES.supplier.some((a) => this.findCsvColumnAny(header, [a]) >= 0) ||
      META_ALIASES.documentNumber.some((a) => this.findCsvColumnAny(header, [a]) >= 0) ||
      header.includes('supplier_name') ||
      header.includes('document_number') ||
      header.includes('invoice_number');

    if (hasStructuredHeader) {
      if (rows.length > 1) {
        meta.supplier_name = pick(META_ALIASES.supplier) ?? pick(['supplier_name', 'supplier']) ?? '';
        meta.document_number =
          pick(META_ALIASES.documentNumber) ??
          pick(['document_number', 'invoice_number', 'po_number', 'purchase_order_number']) ??
          '';
        meta.currency = pick(META_ALIASES.currency) ?? pick(['currency']) ?? '';
        meta.issue_date = pick(META_ALIASES.issueDate) ?? pick(['issue_date', 'issued']) ?? '';
        meta.due_date = pick(META_ALIASES.dueDate) ?? pick(['due_date', 'due']) ?? '';
        meta.subtotal = pick(META_ALIASES.subtotal) ?? pick(['subtotal', 'sub_total']) ?? '';
        meta.tax = pick(META_ALIASES.tax) ?? pick(['tax', 'vat']) ?? '';
        meta.total = pick(META_ALIASES.total) ?? pick(['total', 'amount', 'grand_total']) ?? '';
        const dt =
          pick(['document_type', 'type'])?.toLowerCase() ??
          (header.some((h) => h.includes('purchase') && h.includes('order')) ? 'purchase_order' : '');
        meta.document_type =
          dt.includes('purchase') || dt === 'po' ? 'purchase_order' : 'invoice';

        const dIdx = this.findCsvColumnAny(header, CSV_COLUMN_ALIASES.description);
        const qIdx = this.findCsvColumnAny(header, CSV_COLUMN_ALIASES.quantity);
        const uIdx = this.findCsvColumnAny(header, CSV_COLUMN_ALIASES.unitPrice);
        const ltIdx = this.findCsvColumnAny(header, CSV_COLUMN_ALIASES.lineTotal);

        const lineItems: ExtractedLineItem[] = [];
        if (dIdx >= 0 && rows.length > 2) {
          for (let r = 2; r < rows.length; r++) {
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
        }

        return this.buildFromMetaRecord(meta, lineItems);
      }
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
      return this.buildFromMetaRecord(kv, []);
    }

    return {};
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
    const total =
      this.parseNum(pickMeta(meta, META_ALIASES.total)) ??
      this.parseNum(meta.grand_total) ??
      this.parseMoney(money.total) ??
      this.parseMoney(/(?:grand\s*)?total\s*[:.]?\s*([\d.,]+)/i.exec(t)?.[1]);
    const sub =
      this.parseNum(pickMeta(meta, META_ALIASES.subtotal)) ??
      this.parseMoney(money.subtotal) ??
      this.parseMoney(/subtotal\s*[:.]?\s*([\d.,]+)/i.exec(t)?.[1]);
    const tax =
      this.parseNum(pickMeta(meta, META_ALIASES.tax)) ??
      this.parseMoney(money.tax) ??
      this.parseMoney(/tax\s*(?:\([^)]*\))?\s*[:.]?\s*([\d.,]+)/i.exec(t)?.[1]);

    const issueRaw =
      pickMeta(meta, META_ALIASES.issueDate) || meta.date || meta.issued || extractIssueDateLoose(t);
    const dueRaw = pickMeta(meta, META_ALIASES.dueDate) || meta.due || extractDueDateLoose(t);

    const lineItems = this.parseLoosePdfLineRows(t);

    const cur =
      pickMeta(meta, META_ALIASES.currency) || CURRENCY_FINDER.exec(t)?.[1] || '';

    console.log('[documents.parseTextContent] parsed fields', {
      documentType: docNum ? documentType : null,
      supplierName:
        pickMeta(meta, META_ALIASES.supplier) || meta.vendor || meta.from || looseSupplier || null,
      documentNumber: docNum ?? null,
      issueDateRaw: issueRaw,
      dueDateRaw: dueRaw,
      currency: cur ? cur.toUpperCase() : null,
      subtotal: sub,
      tax,
      total,
      lineItemsCount: lineItems.length,
    });

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

  /** Heuristic: lines with description + 3 trailing numbers (qty, unit, line total), skipping header/summary labels. */
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
      const description = m[1].trim();
      if (LOOSE_ROW_SKIP.test(description) || description.length < 2) {
        continue;
      }
      const quantity = Number(m[2].replace(',', '.'));
      const unitPrice = Number(m[3].replace(',', '.'));
      const lineTotal = Number(m[4].replace(',', '.'));
      if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice) || !Number.isFinite(lineTotal)) {
        continue;
      }
      out.push({ description, quantity, unitPrice, lineTotal });
    }
    return out;
  }

  private parseMoney(s: string | null | undefined): number | null {
    if (s == null || s === '') {
      return null;
    }
    return this.parseNum(s.replace(/[^\d.,\-]/g, '').replace(',', '.'));
  }

  private parseNum(s: string | undefined): number | null {
    if (s === undefined || s === '') {
      return null;
    }
    const n = Number(String(s).replace(',', '.').replace(/\s/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  private parseDate(s: string | null | undefined): Date | null {
    if (s == null || !s.trim()) {
      return null;
    }
    const d = new Date(s.trim());
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /** Match CSV header cell to known column aliases (exact / contains). */
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
