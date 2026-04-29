import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { DocumentService } from '../services/document.service';

@Component({
  selector: 'app-document-upload',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './document-upload.component.html',
  styleUrl: './document-upload.component.scss',
})
export class DocumentUploadComponent {
  private readonly documents = inject(DocumentService);

  readonly acceptedHint =
    'PDF, CSV, TXT, PNG, JPG — extraction runs after upload (mock registers row only).';

  readonly lastMessage = signal<string | null>(null);

  readonly allowedExt = new Set(['.pdf', '.csv', '.txt', '.png', '.jpg', '.jpeg', '.webp']);

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.handleFile(file);
    }
    input.value = '';
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
    const lower = file.name.toLowerCase();
    const ok = [...this.allowedExt].some((ext) => lower.endsWith(ext));
    if (!ok) {
      this.lastMessage.set(`Unsupported file type: ${file.name}`);
      return;
    }
    const created = this.documents.registerMockUpload({ fileName: file.name });
    this.lastMessage.set(`Registered mock upload: ${created.fileName} (${created.id})`);
  }
}
