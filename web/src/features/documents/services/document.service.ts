import { Injectable, signal } from '@angular/core';
import type { DocumentRecord, DocumentStatus } from '../models/document.models';

const MOCK: DocumentRecord[] = [
  {
    id: 'doc-001',
    fileName: 'invoice_acme_march.pdf',
    documentKind: 'invoice',
    supplierName: 'ACME Trading Ltd',
    documentNumber: 'INV-2025-0142',
    issueDate: '2025-03-01',
    dueDate: '2025-03-31',
    currency: 'EUR',
    status: 'needs_review',
    subtotal: 1180.0,
    tax: 236.0,
    total: 1500.0,
    lineItems: [
      {
        id: 'li-1',
        description: 'Consulting hours',
        quantity: 10,
        unitPrice: 118.0,
        lineTotal: 1180.0,
      },
    ],
    validationIssues: [
      {
        field: 'total',
        severity: 'error',
        message: 'Subtotal + tax does not match total.',
      },
      {
        field: 'dueDate',
        severity: 'warning',
        message: 'Due date is before issue date in extracted text (check OCR).',
      },
    ],
    updatedAt: '2025-03-02T10:12:00Z',
  },
  {
    id: 'doc-002',
    fileName: 'po_northwind_77.csv',
    documentKind: 'purchase_order',
    supplierName: 'Northwind LLC',
    documentNumber: 'PO-8891',
    issueDate: '2025-02-10',
    dueDate: '2025-02-24',
    currency: 'USD',
    status: 'validated',
    subtotal: 480.0,
    tax: 96.0,
    total: 576.0,
    lineItems: [
      {
        id: 'li-2',
        description: 'Office supplies',
        quantity: 20,
        unitPrice: 24.0,
        lineTotal: 480.0,
      },
    ],
    validationIssues: [],
    updatedAt: '2025-02-11T08:00:00Z',
  },
  {
    id: 'doc-003',
    fileName: 'invoice_scan_blurry.png',
    documentKind: 'invoice',
    supplierName: '',
    documentNumber: 'UNKNOWN',
    issueDate: '2025-01-05',
    dueDate: '2025-01-20',
    currency: 'BAM',
    status: 'needs_review',
    subtotal: 0,
    tax: 0,
    total: 0,
    lineItems: [],
    validationIssues: [
      { field: 'supplierName', severity: 'error', message: 'Supplier name missing.' },
      { field: 'lineItems', severity: 'error', message: 'No line items extracted.' },
    ],
    updatedAt: '2025-01-06T14:40:00Z',
  },
  {
    id: 'doc-004',
    fileName: 'legacy_po.txt',
    documentKind: 'purchase_order',
    supplierName: 'Contoso',
    documentNumber: 'PO-1001',
    issueDate: '2024-12-01',
    dueDate: '2024-12-15',
    currency: 'EUR',
    status: 'rejected',
    subtotal: 200.0,
    tax: 40.0,
    total: 240.0,
    lineItems: [
      {
        id: 'li-3',
        description: 'Hardware',
        quantity: 2,
        unitPrice: 100.0,
        lineTotal: 200.0,
      },
    ],
    validationIssues: [
      { field: 'documentNumber', severity: 'warning', message: 'Duplicate document number for supplier.' },
    ],
    updatedAt: '2024-12-02T09:00:00Z',
  },
  {
    id: 'doc-005',
    fileName: 'fresh_upload.csv',
    documentKind: 'invoice',
    supplierName: 'Globex',
    documentNumber: 'G-221',
    issueDate: '2025-04-01',
    dueDate: '2025-04-15',
    currency: 'EUR',
    status: 'uploaded',
    subtotal: 90.0,
    tax: 18.0,
    total: 108.0,
    lineItems: [
      {
        id: 'li-4',
        description: 'Subscription',
        quantity: 1,
        unitPrice: 90.0,
        lineTotal: 90.0,
      },
    ],
    validationIssues: [],
    updatedAt: '2025-04-01T11:00:00Z',
  },
];

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly store = signal<DocumentRecord[]>(MOCK);

  list(filter?: DocumentStatus): DocumentRecord[] {
    const rows = this.store();
    if (!filter) {
      return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    return rows
      .filter((d) => d.status === filter)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getById(id: string): DocumentRecord | undefined {
    return this.store().find((d) => d.id === id);
  }

  summaryCounts(): {
    total: number;
    needsReview: number;
    validated: number;
    rejected: number;
  } {
    const rows = this.store();
    return {
      total: rows.length,
      needsReview: rows.filter((d) => d.status === 'needs_review').length,
      validated: rows.filter((d) => d.status === 'validated').length,
      rejected: rows.filter((d) => d.status === 'rejected').length,
    };
  }

  registerMockUpload(meta: { fileName: string }): DocumentRecord {
    const now = new Date().toISOString();
    const created: DocumentRecord = {
      id: `doc-${Date.now()}`,
      fileName: meta.fileName,
      documentKind: 'invoice',
      supplierName: '',
      documentNumber: 'PENDING',
      issueDate: now.slice(0, 10),
      dueDate: now.slice(0, 10),
      currency: 'EUR',
      status: 'uploaded',
      subtotal: 0,
      tax: 0,
      total: 0,
      lineItems: [],
      validationIssues: [
        {
          field: 'supplierName',
          severity: 'warning',
          message: 'Mock upload — extraction not run yet.',
        },
      ],
      updatedAt: now,
    };
    this.store.update((rows) => [created, ...rows]);
    return created;
  }

  patchDocument(id: string, patch: Partial<DocumentRecord>): void {
    this.store.update((rows) =>
      rows.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d)),
    );
  }

  setStatus(id: string, status: DocumentStatus): void {
    this.patchDocument(id, { status });
  }
}
