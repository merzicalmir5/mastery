import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { DocumentService } from '../services/document.service';

@Component({
  selector: 'app-document-detail',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatTableModule,
  ],
  templateUrl: './document-detail.component.html',
  styleUrl: './document-detail.component.scss',
})
export class DocumentDetailComponent {
  readonly linesPage = signal(1);
  readonly linesPageSize = signal(5);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly documents = inject(DocumentService);

  private readonly docId = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id'))),
    { initialValue: this.route.snapshot.paramMap.get('id') },
  );

  readonly doc = computed(() => {
    this.documents.data();
    const id = this.docId();
    return id ? this.documents.getById(id) : undefined;
  });

  readonly lineColumns = ['description', 'quantity', 'unitPrice', 'lineTotal'];
  readonly pagedLineItems = computed(() => {
    const lines = this.doc()?.lineItems ?? [];
    const start = (this.linesPage() - 1) * this.linesPageSize();
    return lines.slice(start, start + this.linesPageSize());
  });
  readonly lineTotalPages = computed(() => {
    const total = this.doc()?.lineItems.length ?? 0;
    return Math.max(1, Math.ceil(total / this.linesPageSize()));
  });

  readonly form = this.fb.nonNullable.group({
    documentType: ['INVOICE' as 'INVOICE' | 'PURCHASE_ORDER'],
    supplierName: [''],
    documentNumber: [''],
    issueDate: [''],
    dueDate: [''],
    currency: [''],
    subtotal: [0],
    tax: [0],
    total: [0],
  });

  constructor() {
    effect(() => {
      const id = this.docId();
      if (!id) {
        return;
      }
      if (this.documents.getById(id)) {
        return;
      }
      this.documents.loadOne(id).subscribe();
    });
    effect(() => {
      const d = this.doc();
      if (!d) {
        return;
      }
      this.form.patchValue({
        documentType: d.documentKind === 'purchase_order' ? 'PURCHASE_ORDER' : 'INVOICE',
        supplierName: d.supplierName,
        documentNumber: d.documentNumber,
        issueDate: d.issueDate,
        dueDate: d.dueDate,
        currency: d.currency,
        subtotal: d.subtotal,
        tax: d.tax,
        total: d.total,
      });
    });
  }

  issuesForField(field: string): string[] {
    const d = this.doc();
    if (!d) {
      return [];
    }
    return d.validationIssues.filter((i) => i.field === field).map((i) => i.message);
  }

  hasIssue(field: string): boolean {
    return this.issuesForField(field).length > 0;
  }

  back(): void {
    void this.router.navigate(['/dashboard/documents']);
  }

  save(): void {
    const id = this.docId();
    if (!id) {
      return;
    }
    const v = this.form.getRawValue();
    this.documents
      .saveDocument(id, {
        documentType: v.documentType,
        supplierName: v.supplierName,
        documentNumber: v.documentNumber,
        issueDate: v.issueDate,
        dueDate: v.dueDate,
        currency: v.currency,
        subtotal: Number(v.subtotal),
        tax: Number(v.tax),
        total: Number(v.total),
      })
      .subscribe({
        next: () => void this.router.navigate(['/dashboard/documents']),
      });
  }

  confirm(): void {
    const id = this.docId();
    if (!id) {
      return;
    }
    const v = this.form.getRawValue();
    this.documents
      .confirmDocument(id, {
        documentType: v.documentType,
        supplierName: v.supplierName,
        documentNumber: v.documentNumber,
        issueDate: v.issueDate,
        dueDate: v.dueDate,
        currency: v.currency,
        subtotal: Number(v.subtotal),
        tax: Number(v.tax),
        total: Number(v.total),
      })
      .subscribe({
        next: () => void this.router.navigate(['/dashboard/documents']),
      });
  }

  reject(): void {
    const id = this.docId();
    if (!id) {
      return;
    }
    this.documents.rejectDocument(id).subscribe({
      next: () => void this.router.navigate(['/dashboard/documents']),
    });
  }

  remove(): void {
    const id = this.docId();
    if (!id) {
      return;
    }
    this.documents.deleteDocument(id).subscribe({
      next: () => void this.router.navigate(['/dashboard/documents']),
    });
  }

  onLinesPageSizeChange(value: string): void {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) {
      return;
    }
    this.linesPageSize.set(next);
    this.linesPage.set(1);
  }

  prevLinesPage(): void {
    if (this.linesPage() <= 1) {
      return;
    }
    this.linesPage.update((v) => v - 1);
  }

  nextLinesPage(): void {
    if (this.linesPage() >= this.lineTotalPages()) {
      return;
    }
    this.linesPage.update((v) => v + 1);
  }
}
