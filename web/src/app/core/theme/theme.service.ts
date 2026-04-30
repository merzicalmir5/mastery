import { Injectable, computed, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'mastery-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly mode = signal<ThemeMode>(this.readStored());

  readonly isDark = computed(() => this.mode() === 'dark');

  constructor() {
    this.applyDom(this.mode());
  }

  toggle(): void {
    const next: ThemeMode = this.mode() === 'dark' ? 'light' : 'dark';
    this.mode.set(next);
    this.persist(next);
    this.applyDom(next);
  }

  private applyDom(mode: ThemeMode): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.classList.toggle('theme-dark', mode === 'dark');
    document.documentElement.classList.toggle('theme-light', mode === 'light');
  }

  private persist(mode: ThemeMode): void {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }

  private readStored(): ThemeMode {
    if (typeof localStorage === 'undefined') {
      return 'light';
    }
    try {
      return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }
}
