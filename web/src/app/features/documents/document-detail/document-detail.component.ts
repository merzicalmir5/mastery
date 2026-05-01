import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import type { LineItem } from '../models/document.models';
import { DocumentFilePreviewComponent } from '../document-file-preview/document-file-preview.component';
import { DocumentService, type DocumentLineItemPatch } from '../services/document.service';

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
    DocumentFilePreviewComponent,
  ],
  templateUrl: './document-detail.component.html',
  styleUrl: './document-detail.component.scss',
})
export class DocumentDetailComponent {
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
    lineItems: this.fb.array<FormGroup>([]),
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.docId();
      if (!id) {
        return;
      }
      const sub = this.documents.loadOne(id).subscribe();
      onCleanup(() => sub.unsubscribe());
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
      const fa = this.lineItemsArray;
      fa.clear();
      for (const li of d.lineItems) {
        fa.push(this.lineGroup(li));
      }
    });
  }

  get lineItemsArray(): FormArray<FormGroup> {
    return this.form.controls.lineItems as FormArray<FormGroup>;
  }

  private lineGroup(li?: LineItem): FormGroup {
    return this.fb.nonNullable.group({
      description: [li?.description ?? ''],
      quantity: [li?.quantity ?? 1],
      unitPrice: [li?.unitPrice ?? 0],
      lineTotal: [li?.lineTotal ?? 0],
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

  issuesForLineIndex(index: number): string[] {
    const d = this.doc();
    if (!d) {
      return [];
    }
    const prefix = `lineItems[${index}]`;
    return d.validationIssues
      .filter((i) => i.field.startsWith(prefix))
      .map((i) => i.message);
  }

  hasLineIssue(index: number): boolean {
    return this.issuesForLineIndex(index).length > 0;
  }

  addLine(): void {
    this.lineItemsArray.push(this.lineGroup());
  }

  removeLine(index: number): void {
    this.lineItemsArray.removeAt(index);
  }

  /** Rows with a non-empty description are sent to the API. */
  collectLineItems(): DocumentLineItemPatch[] {
    return this.lineItemsArray.controls
      .map((ctrl) => ctrl.getRawValue() as Record<string, unknown>)
      .map((v) => ({
        description: String(v['description'] ?? '').trim(),
        quantity: Number(v['quantity']),
        unitPrice: Number(v['unitPrice']),
        lineTotal: Number(v['lineTotal']),
      }))
      .filter((li) => li.description.length > 0);
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
        lineItems: this.collectLineItems(),
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
        lineItems: this.collectLineItems(),
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
}
