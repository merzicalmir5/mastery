import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';
import type { DocumentKind, DocumentRecord, DocumentStatus } from '../models/document.models';
import { DocumentService, type PageParams } from '../services/document.service';

@Component({
  selector: 'app-document-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './document-list.component.html',
  styleUrl: './document-list.component.scss',
})
export class DocumentListComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly documents = inject(DocumentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchSubject = new Subject<string>();

  readonly page = signal(1);
  readonly pageSize = signal(10);

  private readonly statusFilter = toSignal(
    this.route.data.pipe(map((d) => d['statusFilter'] as DocumentStatus | undefined)),
    { initialValue: this.route.snapshot.data['statusFilter'] as DocumentStatus | undefined },
  );

  /** Global search (debounced API value) */
  readonly qApplied = signal('');
  /** Bound to search input for reset/display */
  readonly filterSearchInput = signal('');
  readonly filterFileName = signal('');
  readonly filterKind = signal<DocumentKind | ''>('');
  readonly filterStatus = signal<DocumentStatus | ''>('');
  readonly filterUpdatedFrom = signal('');
  readonly filterUpdatedTo = signal('');
  readonly filterIssues = signal<'has' | 'none' | ''>('');

  readonly showStatusFilter = computed(() => !this.statusFilter());

  readonly rows = computed(() => {
    this.documents.data();
    return this.documents.list(this.statusFilter());
  });
  readonly pageMeta = computed(() => this.documents.pageMeta());

  readonly displayedColumns: string[] = [
    'fileName',
    'documentKind',
    'supplierName',
    'status',
    'issues',
    'updatedAt',
    'actions',
  ];

  constructor() {
    this.searchSubject
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => {
        this.qApplied.set(q);
        this.page.set(1);
        this.documents.refresh(this.refreshParams()).subscribe();
      });
  }

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

  onSearchTyping(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.filterSearchInput.set(v);
    this.searchSubject.next(v);
  }

  onFiltersChange(): void {
    this.loadPage(1);
  }

  resetFilters(): void {
    this.filterSearchInput.set('');
    this.qApplied.set('');
    this.filterFileName.set('');
    this.filterKind.set('');
    this.filterStatus.set('');
    this.filterUpdatedFrom.set('');
    this.filterUpdatedTo.set('');
    this.filterIssues.set('');
    this.page.set(1);
    this.documents.refresh(this.refreshParams()).subscribe();
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

  private refreshParams(): Partial<PageParams> {
    const routeSt = this.statusFilter();
    const status = routeSt ?? (this.filterStatus() || undefined);
    const kind = this.filterKind();
    const issues = this.filterIssues();
    return {
      page: this.page(),
      pageSize: this.pageSize(),
      status,
      q: this.qApplied().trim() || undefined,
      fileName: this.filterFileName().trim() || undefined,
      documentKind: kind ? kind : undefined,
      updatedFrom: this.toIsoOrUndefined(this.filterUpdatedFrom()),
      updatedTo: this.toIsoOrUndefined(this.filterUpdatedTo()),
      issueFilter: issues ? issues : undefined,
    };
  }

  private toIsoOrUndefined(local: string): string | undefined {
    const t = local?.trim();
    if (!t) {
      return undefined;
    }
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) {
      return undefined;
    }
    return d.toISOString();
  }

  private loadPage(page: number): void {
    this.page.set(page);
    this.documents.refresh(this.refreshParams()).subscribe();
  }

  delete(row: DocumentRecord): void {
    this.documents.deleteDocument(row.id).subscribe({
      next: () => {
        this.documents.refresh(this.refreshParams()).subscribe(() => {
          const meta = this.pageMeta();
          if (meta.total === 0) {
            return;
          }
          if (this.page() > meta.totalPages) {
            this.loadPage(Math.max(1, meta.totalPages));
          } else if (this.rows().length === 0 && this.page() > 1) {
            this.loadPage(this.page() - 1);
          }
        });
      },
    });
  }
}
