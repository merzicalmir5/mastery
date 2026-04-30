import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { API_URL } from '../../../core/config/api-url.token';
import type { DocumentKind, DocumentRecord, DocumentStatus, ValidationIssue } from '../models/document.models';

interface DocumentApiRow {
  id: string;
  companyName: string;
  fileName: string;
  originalMimeType: string | null;
  storagePath: string | null;
  sourceType: string;
  documentType: string | null;
  documentNumber: string | null;
  supplierName: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  status: string;
  ingestionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: {
    id: string;
    itemOrder: number;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  validationIssues: {
    id: string;
    fieldPath: string;
    code: string;
    message: string;
    severity: string;
  }[];
}

interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PageParams {
  page: number;
  pageSize: number;
  status?: DocumentStatus;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function mapStatus(s: string): DocumentStatus {
  const m: Record<string, DocumentStatus> = {
    UPLOADED: 'uploaded',
    NEEDS_REVIEW: 'needs_review',
    VALIDATED: 'validated',
    REJECTED: 'rejected',
  };
  return m[s] ?? 'needs_review';
}

function mapKind(dt: string | null): DocumentKind {
  if (dt === 'PURCHASE_ORDER') {
    return 'purchase_order';
  }
  return 'invoice';
}

function mapRow(api: DocumentApiRow): DocumentRecord {
  const issues: ValidationIssue[] = api.validationIssues.map((v) => ({
    field: v.fieldPath,
    severity: v.severity === 'ERROR' ? 'error' : 'warning',
    message: v.message,
  }));

  return {
    id: api.id,
    fileName: api.fileName,
    documentKind: mapKind(api.documentType),
    supplierName: api.supplierName ?? '',
    documentNumber: api.documentNumber ?? '',
    issueDate: api.issueDate ?? '',
    dueDate: api.dueDate ?? '',
    currency: api.currency ?? '',
    status: mapStatus(api.status),
    subtotal: api.subtotal ?? 0,
    tax: api.tax ?? 0,
    total: api.total ?? 0,
    lineItems: api.lineItems.map((li) => ({
      id: li.id,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      lineTotal: li.lineTotal,
    })),
    validationIssues: issues,
    updatedAt: api.updatedAt,
  };
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  private readonly _store = signal<DocumentRecord[]>([]);
  private readonly _pageMeta = signal<PageMeta>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });

  /** Use inside `computed()` (e.g. `this.documents.data()`) so the view updates when data changes. */
  readonly data = this._store.asReadonly();
  readonly pageMeta = this._pageMeta.asReadonly();

  /** Load all documents for the current user (by company). */
  refresh(params?: Partial<PageParams>): Observable<void> {
    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.max(1, params?.pageSize ?? 10);
    const query: Record<string, string> = {
      page: String(page),
      pageSize: String(pageSize),
    };
    if (params?.status) {
      query['status'] = params.status;
    }

    return this.http.get<PaginatedResponse<DocumentApiRow>>(`${this.apiUrl}/documents`, { params: query }).pipe(
      tap((res) => {
        this._store.set(res.items.map(mapRow));
        this._pageMeta.set({
          page: res.page,
          pageSize: res.pageSize,
          total: res.total,
          totalPages: res.totalPages,
        });
      }),
      map(() => undefined),
    );
  }

  /** Load one document and merge into the store. */
  loadOne(id: string): Observable<void> {
    return this.http.get<DocumentApiRow>(`${this.apiUrl}/documents/${id}`).pipe(
      tap((row) => this.upsert(mapRow(row))),
      map(() => undefined),
    );
  }

  /** Multipart upload; runs extraction on the server. */
  uploadFile(file: File): Observable<DocumentRecord> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<DocumentApiRow>(`${this.apiUrl}/documents/upload`, body).pipe(
      map(mapRow),
      tap((rec) => this.upsert(rec)),
    );
  }

  list(filter?: DocumentStatus): DocumentRecord[] {
    const rows = this._store();
    if (!filter) {
      return [...rows];
    }
    return rows.filter((d) => d.status === filter);
  }

  getById(id: string): DocumentRecord | undefined {
    return this._store().find((d) => d.id === id);
  }

  summaryCounts(): {
    total: number;
    needsReview: number;
    validated: number;
    rejected: number;
  } {
    const rows = this._store();
    return {
      total: rows.length,
      needsReview: rows.filter((d) => d.status === 'needs_review').length,
      validated: rows.filter((d) => d.status === 'validated').length,
      rejected: rows.filter((d) => d.status === 'rejected').length,
    };
  }

  confirmDocument(
    id: string,
    fields: {
      documentType: 'INVOICE' | 'PURCHASE_ORDER';
      supplierName: string;
      documentNumber: string;
      issueDate: string;
      dueDate: string;
      currency: string;
      subtotal: number;
      tax: number;
      total: number;
    },
  ): Observable<void> {
    return this.http
      .patch<DocumentApiRow>(`${this.apiUrl}/documents/${id}`, {
        ...fields,
        action: 'confirm',
      })
      .pipe(
        tap((row) => this.upsert(mapRow(row))),
        map(() => undefined),
      );
  }

  rejectDocument(id: string): Observable<void> {
    return this.http
      .patch<DocumentApiRow>(`${this.apiUrl}/documents/${id}`, { action: 'reject' })
      .pipe(
        tap((row) => this.upsert(mapRow(row))),
        map(() => undefined),
      );
  }

  private upsert(rec: DocumentRecord): void {
    this._store.update((rows) => {
      const i = rows.findIndex((r) => r.id === rec.id);
      if (i < 0) {
        return [rec, ...rows];
      }
      const next = [...rows];
      next[i] = rec;
      return next;
    });
  }
}
