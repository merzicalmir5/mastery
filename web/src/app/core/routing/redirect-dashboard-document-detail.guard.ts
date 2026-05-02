import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

export const redirectDashboardDocumentDetailGuard: CanActivateFn = (route) => {
  const id = route.paramMap.get('id');
  const router = inject(Router);
  if (!id) {
    return router.createUrlTree(['/dashboard', 'documents']);
  }
  return router.createUrlTree(['/dashboard', 'documents', id]);
};
