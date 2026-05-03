import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { map, switchMap, take, takeWhile, tap } from 'rxjs/operators';
import { merge, timer } from 'rxjs';
import type { LineItem } from '../models/document.models';
import { roundMoney2Decimals } from '../money-round';

type ExtractedVatLineView = {
  label: string;
  ratePercent: number | null;
  amount: number;
};

function parseVatLinesFromRaw(raw: unknown): ExtractedVatLineView[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const lines = (raw as Record<string, unknown>)['vatLines'];
  if (!Array.isArray(lines)) {
    return [];
  }
  const out: ExtractedVatLineView[] = [];
  for (const row of lines) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const o = row as Record<string, unknown>;
    const amountRaw = o['amount'];
    const amount =
      typeof amountRaw === 'number' && Number.isFinite(amountRaw)
        ? roundMoney2Decimals(amountRaw)
        : null;
    if (amount == null || amount <= 0) {
      continue;
    }
    const label = typeof o['label'] === 'string' && o['label'].trim() ? String(o['label']).trim() : 'VAT';
    const rp = o['ratePercent'];
    const ratePercent =
      typeof rp === 'number' && Number.isFinite(rp) && rp > 0 && rp <= 50 ? roundMoney2Decimals(rp) : null;
    out.push({ label, ratePercent, amount });
  }
  return out;
}
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
    MatProgressSpinnerModule,
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

  readonly documentId = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id'))),
    { initialValue: this.route.snapshot.paramMap.get('id') },
  );

  readonly showDetailSpinner = computed(() => {
    const id = this.documentId();
    if (!id || this.detailLoadFailed()) {
      return false;
    }
    const d = this.doc();
    if (!d) {
      return true;
    }
    return d.status === 'uploaded';
  });

  readonly detailLoadFailed = signal(false);

  private hydratedDocId = signal<string | null>(null);

  readonly doc = computed(() => {
    this.documents.data();
    const id = this.documentId();
    return id ? this.documents.getById(id) : undefined;
  });

  /** VAT rows from OCR (`rawExtractedData.vatLines`), if any. */
  readonly extractedVatLines = computed(() => parseVatLinesFromRaw(this.doc()?.rawExtractedData));

  /** More than one VAT line → separate amount inputs; otherwise single Tax field. */
  readonly useSplitVatInputs = computed(() => this.extractedVatLines().length > 1);

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
    /** One control per OCR VAT line when `useSplitVatInputs()`; otherwise empty. */
    vatAmounts: this.fb.array<FormGroup>([]),
    lineItems: this.fb.array<FormGroup>([]),
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.documentId();
      if (!id) {
        this.detailLoadFailed.set(false);
        return;
      }
      this.detailLoadFailed.set(false);
      let firstPoll = true;
      const pollMs = 280;
      const maxPolls = 220;
      const sub = timer(0, pollMs)
        .pipe(
          take(maxPolls),
          switchMap(() => this.documents.loadOne(id)),
          tap((ok) => {
            if (firstPoll) {
              firstPoll = false;
              if (!ok) {
                this.detailLoadFailed.set(true);
              }
            }
          }),
          map((ok) =>
            ok ? this.documents.getById(id)?.status ?? 'needs_review' : 'needs_review',
          ),
          takeWhile((status) => status === 'uploaded', true),
        )
        .subscribe();
      onCleanup(() => sub.unsubscribe());
    });
    effect(() => {
      const id = this.documentId();
      if (!id) {
        this.hydratedDocId.set(null);
        return;
      }
      const d = this.doc();
      if (!d || d.id !== id) {
        return;
      }

      const navigatedToNewDoc = this.hydratedDocId() !== id;
      if (navigatedToNewDoc) {
        this.hydratedDocId.set(id);
      }

      if (!navigatedToNewDoc && d.status !== 'uploaded' && this.form.dirty) {
        return;
      }

      const vl = this.extractedVatLines();
      this.vatAmountsArray.clear();
      if (vl.length > 1) {
        for (const row of vl) {
          this.vatAmountsArray.push(
            this.fb.group({
              amount: [roundMoney2Decimals(row.amount)],
            }),
          );
        }
      }
      const taxVal =
        vl.length > 1
          ? roundMoney2Decimals(vl.reduce((s, x) => s + x.amount, 0))
          : vl.length === 1
            ? roundMoney2Decimals(vl[0]!.amount)
            : roundMoney2Decimals(d.tax);

      this.form.patchValue(
        {
          documentType: d.documentKind === 'purchase_order' ? 'PURCHASE_ORDER' : 'INVOICE',
          supplierName: d.supplierName,
          documentNumber: d.documentNumber,
          issueDate: d.issueDate,
          dueDate: d.dueDate,
          currency: d.currency,
          subtotal: roundMoney2Decimals(d.subtotal),
          tax: taxVal,
          total: roundMoney2Decimals(d.total),
        },
        { emitEvent: false },
      );
      const fa = this.lineItemsArray;
      fa.clear();
      for (const li of d.lineItems) {
        fa.push(this.lineGroup(li));
      }
      this.form.markAsPristine();
    });

    merge(
      this.form.controls.subtotal.valueChanges,
      this.form.controls.tax.valueChanges,
      this.vatAmountsArray.valueChanges,
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.useSplitVatInputs()) {
          let sum = 0;
          for (const c of this.vatAmountsArray.controls) {
            const a = roundMoney2Decimals(Number(c.get('amount')?.value));
            if (Number.isFinite(a)) {
              sum += a;
            }
          }
          this.form.controls.tax.patchValue(roundMoney2Decimals(sum), { emitEvent: false });
        }
        this.syncTotalFromSubtotalAndTax();
      });
  }

  /** Sum of OCR discount lines, or `totalsCheck.sumDiscounts` when present (matches API formula). */
  private readOcrDiscountSumForTotals(): number {
    const raw = this.doc()?.rawExtractedData;
    if (!raw || typeof raw !== 'object') {
      return 0;
    }
    const o = raw as Record<string, unknown>;
    const tc = o['totalsCheck'];
    if (tc && typeof tc === 'object') {
      const sd = (tc as Record<string, unknown>)['sumDiscounts'];
      if (typeof sd === 'number' && Number.isFinite(sd)) {
        return roundMoney2Decimals(sd);
      }
    }
    const lines = o['discountLines'];
    if (!Array.isArray(lines)) {
      return 0;
    }
    let s = 0;
    for (const row of lines) {
      if (row && typeof row === 'object') {
        const a = (row as Record<string, unknown>)['amount'];
        if (typeof a === 'number' && Number.isFinite(a)) {
          s += a;
        }
      }
    }
    return roundMoney2Decimals(s);
  }

  /** Keeps Total in sync: subtotal + tax − OCR discounts (same as totals check when discounts exist). */
  private syncTotalFromSubtotalAndTax(): void {
    const sub = roundMoney2Decimals(Number(this.form.controls.subtotal.getRawValue()));
    const tax = roundMoney2Decimals(Number(this.form.controls.tax.getRawValue()));
    const discounts = this.readOcrDiscountSumForTotals();
    const total = roundMoney2Decimals(sub + tax - discounts);
    this.form.controls.total.patchValue(total, { emitEvent: false });
  }

  get lineItemsArray(): FormArray<FormGroup> {
    return this.form.controls.lineItems as FormArray<FormGroup>;
  }

  get vatAmountsArray(): FormArray<FormGroup> {
    return this.form.controls.vatAmounts as FormArray<FormGroup>;
  }

  vatGroupAt(index: number): FormGroup {
    return this.vatAmountsArray.at(index) as FormGroup;
  }

  private lineGroup(li?: LineItem): FormGroup {
    const qty = roundMoney2Decimals(li?.quantity ?? 1);
    const lt = roundMoney2Decimals(li?.lineTotal ?? 0);
    const fromApi = li?.unitPrice;
    const unitPrice = roundMoney2Decimals(
      fromApi != null && Number.isFinite(fromApi) && fromApi > 0
        ? fromApi
        : qty > 0
          ? lt / qty
          : 0,
    );
    return this.fb.nonNullable.group({
      description: [li?.description ?? ''],
      quantity: [qty],
      unitPrice: [unitPrice],
      unitLabel: [li?.unitLabel ?? ''],
      lineTotal: [lt],
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

  collectLineItems(): DocumentLineItemPatch[] {
    return this.lineItemsArray.controls
      .map((ctrl) => ctrl.getRawValue() as Record<string, unknown>)
      .map((v) => {
        const qty = roundMoney2Decimals(Number(v['quantity']));
        const lt = roundMoney2Decimals(Number(v['lineTotal']));
        let unitPrice = roundMoney2Decimals(Number(v['unitPrice']));
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          unitPrice = 0;
        }
        if (unitPrice === 0 && qty > 0 && lt > 0) {
          unitPrice = roundMoney2Decimals(lt / qty);
        }
        const unitLabel = String(v['unitLabel'] ?? '').trim();
        return {
          description: String(v['description'] ?? '').trim(),
          quantity: qty,
          unitPrice,
          lineTotal: lt,
          ...(unitLabel ? { unitLabel } : {}),
        };
      })
      .filter((li) => li.description.length > 0);
  }

  back(): void {
    void this.router.navigate(['/dashboard/documents']);
  }

  save(): void {
    const id = this.documentId();
    if (!id) {
      return;
    }
    const v = this.form.getRawValue();
    const taxOut = this.computeTaxForSave(v);
    this.documents
      .saveDocument(id, {
        documentType: v.documentType,
        supplierName: v.supplierName,
        documentNumber: v.documentNumber,
        issueDate: v.issueDate,
        dueDate: v.dueDate,
        currency: v.currency,
        subtotal: roundMoney2Decimals(Number(v.subtotal)),
        tax: taxOut,
        total: roundMoney2Decimals(Number(v.total)),
        lineItems: this.collectLineItems(),
      })
      .subscribe({
        next: () => void this.router.navigate(['/dashboard/documents']),
      });
  }

  confirm(): void {
    const id = this.documentId();
    if (!id) {
      return;
    }
    const v = this.form.getRawValue();
    const taxOut = this.computeTaxForSave(v);
    this.documents
      .confirmDocument(id, {
        documentType: v.documentType,
        supplierName: v.supplierName,
        documentNumber: v.documentNumber,
        issueDate: v.issueDate,
        dueDate: v.dueDate,
        currency: v.currency,
        subtotal: roundMoney2Decimals(Number(v.subtotal)),
        tax: taxOut,
        total: roundMoney2Decimals(Number(v.total)),
        lineItems: this.collectLineItems(),
      })
      .subscribe({
        next: () => void this.router.navigate(['/dashboard/documents']),
      });
  }

  reject(): void {
    const id = this.documentId();
    if (!id) {
      return;
    }
    this.documents.rejectDocument(id).subscribe({
      next: () => void this.router.navigate(['/dashboard/documents']),
    });
  }

  /** Sum of split VAT rows when active; otherwise form `tax`. */
  private computeTaxForSave(v: Record<string, unknown>): number {
    if (this.useSplitVatInputs()) {
      const arr = v['vatAmounts'] as { amount?: unknown }[] | undefined;
      if (Array.isArray(arr)) {
        let s = 0;
        for (const row of arr) {
          const a = roundMoney2Decimals(Number(row?.amount));
          if (Number.isFinite(a)) {
            s += a;
          }
        }
        return roundMoney2Decimals(s);
      }
    }
    return roundMoney2Decimals(Number(v['tax']));
  }

  remove(): void {
    const id = this.documentId();
    if (!id) {
      return;
    }
    this.documents.deleteDocument(id).subscribe({
      next: () => void this.router.navigate(['/dashboard/documents']),
    });
  }
}
