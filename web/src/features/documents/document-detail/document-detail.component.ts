import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
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
    MatButtonModule,
    MatTableModule,
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
    const id = this.docId();
    return id ? this.documents.getById(id) : undefined;
  });

  readonly lineColumns = ['description', 'quantity', 'unitPrice', 'lineTotal'];

  readonly form = this.fb.nonNullable.group({
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
      const d = this.doc();
      if (!d) {
        return;
      }
      this.form.patchValue({
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

  confirm(): void {
    const id = this.docId();
    if (!id) {
      return;
    }
    const v = this.form.getRawValue();
    this.documents.patchDocument(id, {
      supplierName: v.supplierName,
      documentNumber: v.documentNumber,
      issueDate: v.issueDate,
      dueDate: v.dueDate,
      currency: v.currency,
      subtotal: Number(v.subtotal),
      tax: Number(v.tax),
      total: Number(v.total),
      status: 'validated',
      validationIssues: [],
    });
    void this.router.navigate(['/dashboard/documents']);
  }

  reject(): void {
    const id = this.docId();
    if (!id) {
      return;
    }
    this.documents.patchDocument(id, { status: 'rejected' });
    void this.router.navigate(['/dashboard/documents']);
  }
}
