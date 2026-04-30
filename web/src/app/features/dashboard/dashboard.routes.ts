import { Routes } from '@angular/router';
import type { DocumentStatus } from '../documents/models/document.models';

export const dashboardRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/dashboard-home.component').then((m) => m.DashboardHomeComponent),
  },
  {
    path: 'upload',
    loadComponent: () =>
      import('../documents/document-upload/document-upload.component').then(
        (m) => m.DocumentUploadComponent,
      ),
  },
  {
    path: 'documents/:id',
    loadComponent: () =>
      import('../documents/document-detail/document-detail.component').then(
        (m) => m.DocumentDetailComponent,
      ),
  },
  {
    path: 'documents',
    loadComponent: () =>
      import('../documents/document-list/document-list.component').then(
        (m) => m.DocumentListComponent,
      ),
    data: {},
  },
  {
    path: 'review',
    loadComponent: () =>
      import('../documents/document-list/document-list.component').then(
        (m) => m.DocumentListComponent,
      ),
    data: { statusFilter: 'needs_review' satisfies DocumentStatus },
  },
  {
    path: 'validated',
    loadComponent: () =>
      import('../documents/document-list/document-list.component').then(
        (m) => m.DocumentListComponent,
      ),
    data: { statusFilter: 'validated' satisfies DocumentStatus },
  },
  {
    path: 'rejected',
    loadComponent: () =>
      import('../documents/document-list/document-list.component').then(
        (m) => m.DocumentListComponent,
      ),
    data: { statusFilter: 'rejected' satisfies DocumentStatus },
  },
];
