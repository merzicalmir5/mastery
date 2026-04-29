import { Routes } from '@angular/router';

export const dashboardRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/dashboard-home.component').then((m) => m.DashboardHomeComponent),
  },
  {
    path: 'upload',
    loadComponent: () =>
      import('./pages/dashboard-section.component').then((m) => m.DashboardSectionComponent),
    data: { title: 'Upload documents' },
  },
  {
    path: 'documents',
    loadComponent: () =>
      import('./pages/dashboard-section.component').then((m) => m.DashboardSectionComponent),
    data: { title: 'All documents' },
  },
  {
    path: 'review',
    loadComponent: () =>
      import('./pages/dashboard-section.component').then((m) => m.DashboardSectionComponent),
    data: { title: 'Needs review' },
  },
  {
    path: 'validated',
    loadComponent: () =>
      import('./pages/dashboard-section.component').then((m) => m.DashboardSectionComponent),
    data: { title: 'Validated' },
  },
  {
    path: 'rejected',
    loadComponent: () =>
      import('./pages/dashboard-section.component').then((m) => m.DashboardSectionComponent),
    data: { title: 'Rejected' },
  },
];
