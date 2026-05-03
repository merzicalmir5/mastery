import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl, type SafeUrl } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { DocumentService } from '../services/document.service';

type PreviewKind = 'pdf' | 'image' | 'text' | 'unknown';

function classifyBlob(blob: Blob): PreviewKind {
  const t = (blob.type || '').toLowerCase();
  if (t.includes('pdf')) {
    return 'pdf';
  }
  if (t.startsWith('image/')) {
    return 'image';
  }
  if (t.startsWith('text/') || t.includes('csv')) {
    return 'text';
  }
  return 'unknown';
}

@Component({
  selector: 'app-document-file-preview',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule],
  templateUrl: './document-file-preview.component.html',
  styleUrl: './document-file-preview.component.scss',
})
export class DocumentFilePreviewComponent {
  private readonly documents = inject(DocumentService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly documentId = input.required<string>();
  readonly fileName = input('');
  readonly compact = input(false);

  readonly previewBlobUrl = signal<string | null>(null);
  readonly previewKind = signal<PreviewKind>('unknown');
  readonly previewText = signal<string | null>(null);
  readonly loadError = signal(false);

  readonly safeIframeSrc = computed((): SafeResourceUrl | null => {
    const u = this.previewBlobUrl();
    if (!u || this.previewKind() !== 'pdf') {
      return null;
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(u);
  });

  readonly safeImageSrc = computed((): SafeUrl | null => {
    const u = this.previewBlobUrl();
    if (!u || this.previewKind() !== 'image') {
      return null;
    }
    return this.sanitizer.bypassSecurityTrustUrl(u);
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.documentId();
      if (!id) {
        return;
      }

      let blobUrl: string | null = null;
      let textCancelled = false;

      this.loadError.set(false);
      this.previewKind.set('unknown');
      this.previewText.set(null);
      this.previewBlobUrl.set(null);

      const sub = this.documents.getFileBlob(id).subscribe({
        next: (blob) => {
          const kind = classifyBlob(blob);
          this.previewKind.set(kind);
          blobUrl = URL.createObjectURL(blob);
          this.previewBlobUrl.set(blobUrl);
          if (kind === 'text') {
            void blob.text().then((t) => {
              if (textCancelled) {
                return;
              }
              const max = 80_000;
              this.previewText.set(
                t.length > max ? `${t.slice(0, max)}\n\n… (truncated for preview)` : t,
              );
            });
          }
        },
        error: () => this.loadError.set(true),
      });

      onCleanup(() => {
        textCancelled = true;
        sub.unsubscribe();
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
        }
        this.previewBlobUrl.set(null);
        this.previewText.set(null);
        this.previewKind.set('unknown');
      });
    });
  }

  download(): void {
    const id = this.documentId();
    const name = this.fileName().trim() || 'document';
    this.documents.downloadFileBlob(id, name);
  }
}
