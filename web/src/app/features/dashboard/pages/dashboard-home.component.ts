import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import type { DocumentStatus } from '../../documents/models/document.models';
import { DocumentService } from '../../documents/services/document.service';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [MatCardModule, MatTableModule, SlicePipe],
  templateUrl: './dashboard-home.component.html',
  styleUrl: './dashboard-home.component.scss',
})
export class DashboardHomeComponent implements OnInit {
  private readonly documents = inject(DocumentService);
  readonly displayedColumns = ['fileName', 'status', 'issues', 'updatedAt'];
  readonly page = signal(1);
  readonly pageSize = signal(5);

  readonly stats = computed(() => {
    this.documents.data();
    const c = this.documents.summaryCounts();
    return [
      { label: 'Total documents', value: String(c.total), hint: 'All statuses' },
      { label: 'Needs review', value: String(c.needsReview), hint: 'Validation issues' },
      { label: 'Validated', value: String(c.validated), hint: 'Confirmed' },
      { label: 'Rejected', value: String(c.rejected), hint: 'Final' },
    ];
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
}
