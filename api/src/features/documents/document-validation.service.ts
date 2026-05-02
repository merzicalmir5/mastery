import { Injectable } from '@nestjs/common';
import { Document, DocumentLineItem, ValidationSeverity } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

const EPS = 0.02;

type DocWithLines = Document & { lineItems: DocumentLineItem[] };

@Injectable()
export class DocumentValidationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Replaces all validation rows for the document. */
  async run(documentId: string): Promise<void> {
    await this.prisma.documentValidationIssue.deleteMany({ where: { documentId } });

    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { lineItems: { orderBy: { itemOrder: 'asc' } } },
    });
    if (!doc) {
      return;
    }

    const issues: {
      fieldPath: string;
      code: string;
      message: string;
      severity: ValidationSeverity;
    }[] = [];

    this.checkMissingFields(doc, issues);
    await this.checkDuplicateNumber(doc, issues);
    this.checkDates(doc, issues);
    this.checkTotals(doc, issues);
    this.checkLineItems(doc, issues);

    if (issues.length > 0) {
      await this.prisma.documentValidationIssue.createMany({
        data: issues.map((i) => ({
          documentId,
          fieldPath: i.fieldPath,
          code: i.code,
          message: i.message,
          severity: i.severity,
        })),
      });
    }
  }

  private checkMissingFields(doc: DocWithLines, issues: { fieldPath: string; code: string; message: string; severity: ValidationSeverity }[]): void {
    if (doc.documentType == null) {
      issues.push({
        fieldPath: 'documentType',
        code: 'MISSING_FIELD',
        message: 'Document type (invoice or purchase order) is missing.',
        severity: 'WARNING',
      });
    }
    if (!doc.supplierName?.trim()) {
      issues.push({
        fieldPath: 'supplierName',
        code: 'MISSING_FIELD',
        message: 'Supplier / company name is missing.',
        severity: 'ERROR',
      });
    }
    if (!doc.documentNumber?.trim()) {
      issues.push({
        fieldPath: 'documentNumber',
        code: 'MISSING_FIELD',
        message: 'Document number is missing.',
        severity: 'ERROR',
      });
    }
    if (!doc.issueDate) {
      issues.push({
        fieldPath: 'issueDate',
        code: 'MISSING_FIELD',
        message: 'Issue date is missing.',
        severity: 'WARNING',
      });
    }
    if (!doc.dueDate) {
      issues.push({
        fieldPath: 'dueDate',
        code: 'MISSING_FIELD',
        message: 'Due date is missing.',
        severity: 'WARNING',
      });
    }
    if (!doc.currency?.trim()) {
      issues.push({
        fieldPath: 'currency',
        code: 'MISSING_FIELD',
        message: 'Currency is missing.',
        severity: 'WARNING',
      });
    }
    if (doc.subtotal == null) {
      issues.push({
        fieldPath: 'subtotal',
        code: 'MISSING_FIELD',
        message: 'Subtotal is missing.',
        severity: 'WARNING',
      });
    }
    if (doc.tax == null) {
      issues.push({
        fieldPath: 'tax',
        code: 'MISSING_FIELD',
        message: 'Tax is missing.',
        severity: 'WARNING',
      });
    }
    if (doc.total == null) {
      issues.push({
        fieldPath: 'total',
        code: 'MISSING_FIELD',
        message: 'Total is missing.',
        severity: 'WARNING',
      });
    }
    if (doc.lineItems.length === 0) {
      issues.push({
        fieldPath: 'lineItems',
        code: 'MISSING_ITEMS',
        message: 'No line items extracted.',
        severity: 'WARNING',
      });
    }
  }

  private async checkDuplicateNumber(doc: DocWithLines, issues: { fieldPath: string; code: string; message: string; severity: ValidationSeverity }[]): Promise<void> {
    const num = doc.documentNumber?.trim();
    if (!num) {
      return;
    }
    const count = await this.prisma.document.count({
      where: {
        companyName: doc.companyName,
        documentNumber: num,
        NOT: { id: doc.id },
      },
    });
    if (count > 0) {
      issues.push({
        fieldPath: 'documentNumber',
        code: 'DUPLICATE',
        message: 'Another document with this number already exists for your company.',
        severity: 'ERROR',
      });
    }
  }

  private checkDates(doc: DocWithLines, issues: { fieldPath: string; code: string; message: string; severity: ValidationSeverity }[]): void {
    if (doc.issueDate && doc.dueDate && doc.issueDate.getTime() > doc.dueDate.getTime()) {
      issues.push({
        fieldPath: 'dueDate',
        code: 'DATE_ORDER',
        message: 'Due date is before issue date.',
        severity: 'WARNING',
      });
    }
  }

  private checkTotals(doc: DocWithLines, issues: { fieldPath: string; code: string; message: string; severity: ValidationSeverity }[]): void {
    const sub = doc.subtotal != null ? Number(doc.subtotal) : null;
    const tax = doc.tax != null ? Number(doc.tax) : null;
    const tot = doc.total != null ? Number(doc.total) : null;

    if (sub !== null && tax !== null && tot !== null) {
      if (Math.abs(sub + tax - tot) > EPS) {
        issues.push({
          fieldPath: 'total',
          code: 'TOTAL_MISMATCH',
          message: 'Subtotal + tax does not match total.',
          severity: 'ERROR',
        });
      }
    }
  }

  private checkLineItems(doc: DocWithLines, issues: { fieldPath: string; code: string; message: string; severity: ValidationSeverity }[]): void {
    const sub = doc.subtotal != null ? Number(doc.subtotal) : null;
    const sumLines = doc.lineItems.reduce((s, li) => s + Number(li.lineTotal), 0);

    if (doc.lineItems.length > 0 && sub !== null && Math.abs(sumLines - sub) > EPS) {
      issues.push({
        fieldPath: 'subtotal',
        code: 'LINE_SUM',
        message: 'Sum of line totals does not match subtotal.',
        severity: 'WARNING',
      });
    }

    for (const li of doc.lineItems) {
      const q = Number(li.quantity);
      const u = Number(li.unitPrice);
      const lt = Number(li.lineTotal);
      if (Math.abs(q * u - lt) > EPS) {
        issues.push({
          fieldPath: `lineItems[${li.itemOrder}].lineTotal`,
          code: 'LINE_CALC',
          message: `Line "${li.description.slice(0, 40)}": quantity × unit price ≠ line total.`,
          severity: 'WARNING',
        });
      }
    }
  }
}
