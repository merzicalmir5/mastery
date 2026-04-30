import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_URL } from '../config/api-url.token';
import { AuthService } from './auth.service';

/** Adds Bearer token only to requests targeting the configured API base URL. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const apiUrl = inject(API_URL);
  const token = auth.getAccessToken();
  if (!token || !req.url.startsWith(apiUrl)) {
    return next(req);
  }
  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    }),
  );
};
