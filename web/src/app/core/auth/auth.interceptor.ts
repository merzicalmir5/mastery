import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { API_URL } from '../config/api-url.token';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const apiUrl = inject(API_URL);
  const router = inject(Router);

  const token = auth.getAccessToken();
  const isApiRequest = req.url.startsWith(apiUrl);

  let outbound = req;
  if (token && isApiRequest) {
    outbound = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(outbound).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !isApiRequest) {
        return throwError(() => error);
      }

      if (req.url.includes('/auth/refresh')) {
        auth.clearTokens();
        void router.navigate(['/login']);
        return throwError(() => error);
      }

      if (req.headers.has('X-Auth-Retry')) {
        auth.clearTokens();
        void router.navigate(['/login']);
        return throwError(() => error);
      }

      if (!auth.getRefreshToken()) {
        auth.clearTokens();
        void router.navigate(['/login']);
        return throwError(() => error);
      }

      return auth.refreshSession().pipe(
        switchMap(() => {
          const newTok = auth.getAccessToken();
          if (!newTok) {
            auth.clearTokens();
            void router.navigate(['/login']);
            return throwError(() => error);
          }
          return next(
            req.clone({
              setHeaders: {
                Authorization: `Bearer ${newTok}`,
                'X-Auth-Retry': '1',
              },
            }),
          );
        }),
        catchError(() => {
          auth.clearTokens();
          void router.navigate(['/login']);
          return throwError(() => error);
        }),
      );
    }),
  );
};
