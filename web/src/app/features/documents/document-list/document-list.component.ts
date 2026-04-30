import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
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
export class DocumentListComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly documents = inject(DocumentService);

  private readonly statusFilter = toSignal(
    this.route.data.pipe(map((d) => d['statusFilter'] as DocumentStatus | undefined)),
    { initialValue: this.route.snapshot.data['statusFilter'] as DocumentStatus | undefined },
  );

  readonly rows = computed(() => this.documents.list(this.statusFilter()));

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
}
