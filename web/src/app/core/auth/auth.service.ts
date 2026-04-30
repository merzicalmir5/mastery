import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { API_URL } from '../config/api-url.token';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthSuccessResponse {
  message: string;
  tokens: AuthTokens;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  private readonly accessTokenKey = 'auth.accessToken';
  private readonly refreshTokenKey = 'auth.refreshToken';
  private readonly authenticated = signal<boolean>(this.hasAccessToken());

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
      .post<AuthSuccessResponse>(`${this.apiUrl}/auth/register`, {
        companyName,
        email: email.trim().toLowerCase(),
        password,
      })
      .pipe(
        tap((res) => this.setTokens(res.tokens)),
        map(() => undefined),
      );
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
}
