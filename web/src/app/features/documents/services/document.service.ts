import { HttpClient, HttpEventType, HttpResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { EMPTY, Observable, catchError, filter, map, mergeMap, of, tap } from 'rxjs';
import { API_URL } from '../../../core/config/api-url.token';
import type {
  DocumentKind,
  DocumentRecord,
  DocumentSourceType,
  DocumentStatus,
  ValidationIssue,
} from '../models/document.models';

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
  lineItemsData?: unknown | null;
  lineItems: {
    id: string;
    itemOrder: number;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    unitLabel: string | null;
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
  q?: string;
  fileName?: string;
  documentKind?: DocumentKind;
  updatedFrom?: string;
  updatedTo?: string;
  issueFilter?: 'has' | 'none';
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type DocumentLineItemPatch = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  unitLabel?: string;
};

export type UploadFileEvent =
  | { type: 'progress'; loaded: number; total?: number }
  | { type: 'done'; record: DocumentRecord };

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

function mapSourceType(s: string): DocumentSourceType {
  if (s === 'IMAGE' || s === 'CSV' || s === 'TXT' || s === 'PDF') {
    return s;
  }
  return 'TXT';
}

function mapRow(api: DocumentApiRow): DocumentRecord {
  const issues: ValidationIssue[] = api.validationIssues.map((v) => ({
    field: v.fieldPath,
    severity: v.severity === 'ERROR' ? 'error' : 'warning',
    message: v.message,
  }));

  return {
    id: api.id,
    lineItemsData: api.lineItemsData ?? undefined,
    fileName: api.fileName,
    sourceType: mapSourceType(api.sourceType),
    originalMimeType: api.originalMimeType,
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
      unitLabel: li.unitLabel ?? undefined,
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

  readonly data = this._store.asReadonly();
  readonly pageMeta = this._pageMeta.asReadonly();

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
    if (params?.q?.trim()) {
      query['q'] = params.q.trim();
    }
    if (params?.fileName?.trim()) {
      query['fileName'] = params.fileName.trim();
    }
    if (params?.documentKind) {
      query['documentKind'] = params.documentKind;
    }
    if (params?.updatedFrom?.trim()) {
      query['updatedFrom'] = params.updatedFrom.trim();
    }
    if (params?.updatedTo?.trim()) {
      query['updatedTo'] = params.updatedTo.trim();
    }
    if (params?.issueFilter) {
      query['issueFilter'] = params.issueFilter;
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

  loadOne(id: string): Observable<boolean> {
    return this.http.get<DocumentApiRow>(`${this.apiUrl}/documents/${id}`).pipe(
      tap((row) => this.upsert(mapRow(row))),
      map(() => true),
      catchError(() => of(false)),
    );
  }

  uploadFileEvents(file: File): Observable<UploadFileEvent> {
    const body = new FormData();
    body.append('file', file);
    return this.http
      .post<DocumentApiRow>(`${this.apiUrl}/documents/upload`, body, {
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        mergeMap((event) => {
          if (event.type === HttpEventType.UploadProgress) {
            return of({
              type: 'progress' as const,
              loaded: event.loaded,
              total: event.total ?? undefined,
            });
          }
          if (event.type === HttpEventType.Response) {
            const res = event as HttpResponse<DocumentApiRow>;
            const row = res.body;
            if (!row) {
              return EMPTY;
            }
            const rec = mapRow(row);
            this.upsert(rec);
            return of({ type: 'done' as const, record: rec });
          }
          return EMPTY;
        }),
      );
  }

  uploadFile(file: File): Observable<DocumentRecord> {
    return this.uploadFileEvents(file).pipe(
      filter((e): e is { type: 'done'; record: DocumentRecord } => e.type === 'done'),
      map((e) => e.record),
    );
  }

  getFileBlob(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/documents/${id}/file`, { responseType: 'blob' });
  }

  downloadFileBlob(id: string, fileName: string): void {
    this.getFileBlob(id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'document';
        a.rel = 'noopener';
        a.click();
        URL.revokeObjectURL(url);
      },
    });
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
      lineItems: DocumentLineItemPatch[];
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

  saveDocument(
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
      lineItems: DocumentLineItemPatch[];
    },
  ): Observable<void> {
    return this.http
      .patch<DocumentApiRow>(`${this.apiUrl}/documents/${id}`, {
        ...fields,
        action: 'save',
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

  deleteDocument(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/documents/${id}`).pipe(
      tap(() => this.removeFromStore(id)),
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

  private removeFromStore(id: string): void {
    this._store.update((rows) => rows.filter((r) => r.id !== id));
  }
}
