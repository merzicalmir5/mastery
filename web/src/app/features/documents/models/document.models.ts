export type DocumentStatus = 'uploaded' | 'needs_review' | 'validated' | 'rejected';

export type DocumentKind = 'invoice' | 'purchase_order';

export type DocumentSourceType = 'PDF' | 'IMAGE' | 'CSV' | 'TXT';

export interface ValidationIssue {
  field: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  unitLabel?: string | null;
}

export interface DocumentRecord {
  id: string;
  fileName: string;
  sourceType: DocumentSourceType;
  originalMimeType: string | null;
  documentKind: DocumentKind;
  supplierName: string;
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  status: DocumentStatus;
  subtotal: number;
  tax: number;
  total: number;
  lineItems: LineItem[];
  validationIssues: ValidationIssue[];
  updatedAt: string;
}
