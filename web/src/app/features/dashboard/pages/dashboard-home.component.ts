import { CommonModule, DecimalPipe, SlicePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import type { DocumentRecord, DocumentStatus } from '../../documents/models/document.models';
import { DocumentService } from '../../documents/services/document.service';

type DashboardStatTone = 'neutral' | 'needs_review' | 'validated' | 'rejected';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatTableModule, MatButtonModule, SlicePipe, DecimalPipe],
  templateUrl: './dashboard-home.component.html',
  styleUrl: './dashboard-home.component.scss',
})
export class DashboardHomeComponent implements OnInit {
  private readonly documents = inject(DocumentService);
  readonly displayedColumns = ['fileName', 'status', 'issues', 'updatedAt', 'actions'];
  readonly currencyColumns = ['currency', 'total'];
  readonly page = signal(1);
  readonly pageSize = signal(5);

  readonly stats = computed(() => {
    this.documents.data();
    const c = this.documents.summaryCounts();
    return [
      { label: 'Total documents', value: String(c.total), hint: 'All statuses', tone: 'neutral' as const },
      {
        label: 'Needs review',
        value: String(c.needsReview),
        hint: 'Validation issues',
        tone: 'needs_review' as const,
      },
      { label: 'Validated', value: String(c.validated), hint: 'Confirmed', tone: 'validated' as const },
      { label: 'Rejected', value: String(c.rejected), hint: 'Final', tone: 'rejected' as const },
    ] satisfies ReadonlyArray<{
      label: string;
      value: string;
      hint: string;
      tone: DashboardStatTone;
    }>;
  });

  readonly recentDocuments = computed(() => {
    this.documents.data();
    const all = this.documents.list();
    const start = (this.page() - 1) * this.pageSize();
    return all.slice(start, start + this.pageSize());
  });
  readonly totalRows = computed(() => {
    this.documents.data();
    return this.documents.list().length;
  });
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalRows() / this.pageSize())));

  /** Sum of stored `total` per currency for documents currently in the list (up to pageSize 100 on load). */
  readonly totalsByCurrency = computed(() => {
    this.documents.data();
    const map = new Map<string, number>();
    for (const d of this.documents.list()) {
      const cur = d.currency?.trim();
      if (!cur) {
        continue;
      }
      map.set(cur, (map.get(cur) ?? 0) + Number(d.total));
    }
    return [...map.entries()]
      .map(([currency, total]) => ({ currency, total }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  });

  statusLabel(status: DocumentStatus): string {
    const map: Record<DocumentStatus, string> = {
      uploaded: 'Uploaded',
      needs_review: 'Needs review',
      validated: 'Validated',
      rejected: 'Rejected',
    };
    return map[status];
  }

  ngOnInit(): void {
    this.documents.refresh({ page: 1, pageSize: 100 }).subscribe();
  }

  onPageSizeChange(value: string): void {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) {
      return;
    }
    this.pageSize.set(next);
    this.page.set(1);
  }

  prevPage(): void {
    if (this.page() <= 1) {
      return;
    }
    this.page.update((v) => v - 1);
  }

  nextPage(): void {
    if (this.page() >= this.totalPages()) {
      return;
    }
    this.page.update((v) => v + 1);
  }

  delete(row: DocumentRecord): void {
    this.documents.deleteDocument(row.id).subscribe({
      next: () => {
        this.documents.refresh({ page: 1, pageSize: 100 }).subscribe(() => {
          const maxPage = this.totalPages();
          if (this.page() > maxPage) {
            this.page.set(maxPage);
          }
        });
      },
    });
  }
}
