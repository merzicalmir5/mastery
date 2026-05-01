import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { DocumentFilePreviewComponent } from '../document-file-preview/document-file-preview.component';
import { DocumentService } from '../services/document.service';

@Component({
  selector: 'app-document-upload',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    DocumentFilePreviewComponent,
  ],
  templateUrl: './document-upload.component.html',
  styleUrl: './document-upload.component.scss',
})
export class DocumentUploadComponent {
  private static readonly MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

  private readonly documents = inject(DocumentService);

  readonly acceptedHint =
    'PDF, CSV, TXT, PNG, JPG — files are saved on the server and extraction runs automatically.';

  readonly lastMessage = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly lastUploadedId = signal<string | null>(null);
  readonly lastUploadedFileName = signal<string>('');

  readonly allowedExt = new Set(['.pdf', '.csv', '.txt', '.png', '.jpg', '.jpeg', '.webp']);

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.handleFile(file);
    }
    input.value = '';
  }

  onZoneKeyActivate(ev: Event, input: HTMLInputElement): void {
    if (this.uploading()) {
      return;
    }
    ev.preventDefault();
    input.click();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.handleFile(file);
    }
  }

  private handleFile(file: File): void {
    if (this.uploading()) {
      return;
    }
    const lower = file.name.toLowerCase();
    const ok = [...this.allowedExt].some((ext) => lower.endsWith(ext));
    if (!ok) {
      this.lastMessage.set(`Unsupported file type: ${file.name}`);
      return;
    }
    if (file.size > DocumentUploadComponent.MAX_FILE_SIZE_BYTES) {
      this.lastMessage.set('File is too large. Maximum upload size is 15 MB.');
      return;
    }
    this.uploading.set(true);
    this.lastMessage.set(null);
    this.lastUploadedId.set(null);
    this.documents
      .uploadFile(file)
      .pipe(
        finalize(() => this.uploading.set(false)),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (created) => {
          this.lastUploadedId.set(created.id);
          this.lastUploadedFileName.set(created.fileName);
          this.lastMessage.set(`Uploaded: ${created.fileName} (${created.id}). Status: ${created.status}.`);
        },
        error: (err: unknown) => {
          const message =
            err instanceof HttpErrorResponse && typeof err.error?.message === 'string'
              ? err.error.message
              : 'Upload failed. Check that you are logged in and the API is running.';
          this.lastMessage.set(message);
        },
      });
  }
}
