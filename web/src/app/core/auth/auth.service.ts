import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { API_URL } from '../config/api-url.token';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SessionUser {
  email: string;
  companyName: string;
}

interface AuthSuccessResponse {
  message: string;
  tokens: AuthTokens;
}

interface RegisterSuccessResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  private readonly accessTokenKey = 'auth.accessToken';
  private readonly refreshTokenKey = 'auth.refreshToken';
  private readonly authenticated = signal<boolean>(this.hasAccessToken());
  private readonly tokenRevision = signal(0);

  private refreshSingleton$: Observable<void> | null = null;

  readonly sessionUser = computed((): SessionUser | null => {
    this.tokenRevision();
    return this.readSessionUserFromAccessToken();
  });

  isAuthenticated(): boolean {
    return this.authenticated();
  }

  login(email: string, password: string): Observable<void> {
    return this.http
      .post<AuthSuccessResponse>(`${this.apiUrl}/auth/login`, {
        email: email.trim().toLowerCase(),
        password,
      })
      .pipe(
        tap((res) => this.setTokens(res.tokens)),
        map(() => undefined),
      );
  }

  register(companyName: string, email: string, password: string): Observable<void> {
    return this.http
      .post<RegisterSuccessResponse>(`${this.apiUrl}/auth/register`, {
        companyName,
        email: email.trim().toLowerCase(),
        password,
      })
      .pipe(map(() => undefined));
  }

  verifyEmail(token: string): Observable<void> {
    return this.http
      .get<{ message: string }>(`${this.apiUrl}/auth/verify-email`, {
        params: { token },
      })
      .pipe(map(() => undefined));
  }

  resetPassword(token: string, newPassword: string): Observable<void> {
    return this.http
      .post<{ message: string }>(`${this.apiUrl}/auth/reset-password`, {
        token,
        newPassword,
      })
      .pipe(map(() => undefined));
  }

  /** Calls API logout (Bearer + refresh body), then clears local tokens. */
  logoutSession(): Observable<void> {
    const refresh = this.getRefreshToken();
    if (!refresh) {
      this.clearTokens();
      return of(undefined);
    }
    return this.http.post<{ message: string }>(`${this.apiUrl}/auth/logout`, { refreshToken: refresh }).pipe(
      tap(() => this.clearTokens()),
      map(() => undefined),
      catchError(() => {
        this.clearTokens();
        return of(undefined);
      }),
    );
  }

  setTokens(tokens: AuthTokens): void {
    localStorage.setItem(this.accessTokenKey, tokens.accessToken);
    localStorage.setItem(this.refreshTokenKey, tokens.refreshToken);
    this.authenticated.set(true);
    this.tokenRevision.update((n) => n + 1);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.accessTokenKey);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshTokenKey);
  }

  clearTokens(): void {
    localStorage.removeItem(this.accessTokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    this.authenticated.set(false);
    this.tokenRevision.update((n) => n + 1);
  }

  refreshSession(): Observable<void> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token'));
    }
    if (this.refreshSingleton$) {
      return this.refreshSingleton$;
    }
    this.refreshSingleton$ = this.http
      .post<AuthTokens>(`${this.apiUrl}/auth/refresh`, { refreshToken })
      .pipe(
        tap((tokens) => this.setTokens(tokens)),
        map(() => undefined),
        shareReplay({ bufferSize: 1, refCount: true }),
        finalize(() => {
          this.refreshSingleton$ = null;
        }),
      );
    return this.refreshSingleton$;
  }

  static parseErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as { message?: string | string[] } | null;
      if (body && typeof body.message === 'string') {
        return body.message;
      }
      if (body && Array.isArray(body.message)) {
        return body.message.join(', ');
      }
      if (error.status === 0) {
        return 'Cannot reach the server. Is the API running?';
      }
    }
    return 'Something went wrong.';
  }

  private hasAccessToken(): boolean {
    return !!localStorage.getItem(this.accessTokenKey);
  }

  private readSessionUserFromAccessToken(): SessionUser | null {
    const token = this.getAccessToken();
    if (!token) {
      return null;
    }
    const payload = AuthService.decodeJwtPayload(token);
    if (!payload || typeof payload.email !== 'string') {
      return null;
    }
    return {
      email: payload.email,
      companyName: typeof payload.companyName === 'string' ? payload.companyName : '',
    };
  }

  private static decodeJwtPayload(token: string): { email?: string; companyName?: string } | null {
    try {
      const parts = token.split('.');
      if (parts.length < 2 || !parts[1]) {
        return null;
      }
      let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4;
      if (pad) {
        base64 += '='.repeat(4 - pad);
      }
      const json = globalThis.atob(base64);
      return JSON.parse(json) as { email?: string; companyName?: string };
    } catch {
      return null;
    }
  }
}
