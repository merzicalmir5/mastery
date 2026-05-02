import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
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
    MatProgressBarModule,
    MatProgressSpinnerModule,
    DocumentFilePreviewComponent,
  ],
  templateUrl: './document-upload.component.html',
  styleUrl: './document-upload.component.scss',
})
export class DocumentUploadComponent {
  private static readonly MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

  private readonly documents = inject(DocumentService);
  private readonly destroyRef = inject(DestroyRef);

  readonly acceptedHint =
    'PDF, CSV, TXT, PNG, JPG — saved on the server; extraction runs right after upload (you can open the document while it finishes).';

  readonly lastMessage = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly uploadPercent = signal<number | null>(null);
  readonly uploadOverlayLabel = signal('Sending file…');
  readonly lastUploadedId = signal<string | null>(null);
  readonly lastUploadedFileName = signal<string>('');

  readonly webcamOpen = signal(false);
  private webcamStream: MediaStream | null = null;

  readonly webcamVideo = viewChild<ElementRef<HTMLVideoElement>>('webcamVideo');
  readonly cameraFileInput = viewChild<ElementRef<HTMLInputElement>>('cameraInput');

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
    this.uploadPercent.set(null);
    this.uploadOverlayLabel.set('Sending file…');
    this.lastMessage.set(null);
    this.lastUploadedId.set(null);
    this.documents
      .uploadFileEvents(file)
      .pipe(
        finalize(() => {
          this.uploading.set(false);
          this.uploadPercent.set(null);
          this.uploadOverlayLabel.set('Sending file…');
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (ev) => {
          if (ev.type === 'progress') {
            const { loaded, total } = ev;
            if (total && total > 0) {
              const p = Math.min(100, Math.round((100 * loaded) / total));
              this.uploadPercent.set(p);
              this.uploadOverlayLabel.set(p >= 100 ? 'Finishing…' : `Sending file… ${p}%`);
            } else {
              this.uploadPercent.set(null);
              this.uploadOverlayLabel.set(`Sending… ${this.formatBytes(loaded)}`);
            }
            return;
          }
          const created = ev.record;
          this.lastUploadedId.set(created.id);
          this.lastUploadedFileName.set(created.fileName);
          this.lastMessage.set(
            `Uploaded: ${created.fileName}. Extraction may take a few seconds — open the document or refresh the list if fields are still empty.`,
          );
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

  private formatBytes(n: number): string {
    if (n < 1024) {
      return `${n} B`;
    }
    if (n < 1024 * 1024) {
      return `${(n / 1024).toFixed(1)} KB`;
    }
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  async openScanCamera(): Promise<void> {
    if (this.uploading()) {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.cameraFileInput()?.nativeElement.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      this.webcamStream = stream;
      this.webcamOpen.set(true);
      setTimeout(() => this.attachWebcamStream(), 0);
    } catch {
      this.lastMessage.set(
        'Could not open the camera. Allow permission in the browser, or upload a file using Upload file on the left.',
      );
      this.cameraFileInput()?.nativeElement.click();
    }
  }

  private attachWebcamStream(): void {
    const el = this.webcamVideo()?.nativeElement;
    const stream = this.webcamStream;
    if (el && stream) {
      el.srcObject = stream;
      void el.play().catch(() => undefined);
    }
  }

  captureFromWebcam(): void {
    const video = this.webcamVideo()?.nativeElement;
    if (!video || video.readyState < 2) {
      this.lastMessage.set('Wait for the camera preview to appear, then try Capture again.');
      return;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          return;
        }
        const file = new File([blob], 'camera-scan.jpg', { type: 'image/jpeg' });
        this.closeWebcam();
        this.handleFile(file);
      },
      'image/jpeg',
      0.92,
    );
  }

  closeWebcam(): void {
    this.webcamStream?.getTracks().forEach((t) => t.stop());
    this.webcamStream = null;
    const el = this.webcamVideo()?.nativeElement;
    if (el) {
      el.srcObject = null;
    }
    this.webcamOpen.set(false);
  }
}
