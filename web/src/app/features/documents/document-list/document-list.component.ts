import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
import type { DocumentRecord, DocumentStatus } from '../models/document.models';
import { DocumentService } from '../services/document.service';

@Component({
  selector: 'app-document-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  templateUrl: './document-list.component.html',
  styleUrl: './document-list.component.scss',
})
export class DocumentListComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly documents = inject(DocumentService);

  readonly page = signal(1);
  readonly pageSize = signal(10);

  private readonly statusFilter = toSignal(
    this.route.data.pipe(map((d) => d['statusFilter'] as DocumentStatus | undefined)),
    { initialValue: this.route.snapshot.data['statusFilter'] as DocumentStatus | undefined },
  );

  readonly rows = computed(() => {
    this.documents.data();
    return this.documents.list(this.statusFilter());
  });
  readonly pageMeta = computed(() => this.documents.pageMeta());

  readonly pageTitle = computed(() => {
    const f = this.statusFilter();
    if (f === undefined) {
      return 'All documents';
    }
    const map: Record<DocumentStatus, string> = {
      uploaded: 'Uploaded',
      needs_review: 'Needs review',
      validated: 'Validated',
      rejected: 'Rejected',
    };
    return map[f] ?? 'Documents';
  });

  readonly displayedColumns: string[] = [
    'fileName',
    'documentKind',
    'supplierName',
    'status',
    'issues',
    'updatedAt',
    'actions',
  ];

  statusLabel(s: DocumentStatus): string {
    const m: Record<DocumentStatus, string> = {
      uploaded: 'Uploaded',
      needs_review: 'Needs review',
      validated: 'Validated',
      rejected: 'Rejected',
    };
    return m[s];
  }

  issueTooltip(row: DocumentRecord): string {
    return row.validationIssues.map((i) => i.message).join('\n');
  }

  ngOnInit(): void {
    this.loadPage(1);
  }

  onPageSizeChange(value: string): void {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) {
      return;
    }
    this.pageSize.set(next);
    this.loadPage(1);
  }

  prevPage(): void {
    const current = this.page();
    if (current <= 1) {
      return;
    }
    this.loadPage(current - 1);
  }

  nextPage(): void {
    const meta = this.pageMeta();
    if (this.page() >= meta.totalPages) {
      return;
    }
    this.loadPage(this.page() + 1);
  }

  private loadPage(page: number): void {
    this.page.set(page);
    this.documents
      .refresh({
        page,
        pageSize: this.pageSize(),
        status: this.statusFilter(),
      })
      .subscribe();
  }
}
