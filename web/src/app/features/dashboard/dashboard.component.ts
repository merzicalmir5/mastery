import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';

const MOBILE_QUERY = '(max-width: 959.98px)';

function initialSidenavOpened(): boolean {
  if (typeof globalThis === 'undefined' || !globalThis.matchMedia) {
    return true;
  }
  return !globalThis.matchMedia(MOBILE_QUERY).matches;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly breakpoint = inject(BreakpointObserver);
  protected readonly theme = inject(ThemeService);

  protected readonly isMobile = signal(
    typeof globalThis !== 'undefined' && globalThis.matchMedia
      ? globalThis.matchMedia(MOBILE_QUERY).matches
      : false,
  );

  protected readonly sidenavOpen = signal(initialSidenavOpened());

  constructor() {
    this.breakpoint
      .observe(MOBILE_QUERY)
      .pipe(
        map((r) => r.matches),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((mobile) => {
        const wasMobile = this.isMobile();
        this.isMobile.set(mobile);
        if (mobile) {
          this.sidenavOpen.set(false);
        } else if (wasMobile && !mobile) {
          this.sidenavOpen.set(true);
        }
      });
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  toggleSidenav(): void {
    this.sidenavOpen.update((open) => !open);
  }

  onSidenavOpenedChange(opened: boolean): void {
    this.sidenavOpen.set(opened);
  }

  closeSidenavAfterNav(): void {
    if (this.isMobile()) {
      this.sidenavOpen.set(false);
    }
  }

  readonly navItems = [
    {
      label: 'Home',
      route: '/dashboard',
      icon: 'dashboard',
      exact: true,
    },
    {
      label: 'Upload documents',
      route: '/dashboard/upload',
      icon: 'upload_file',
      exact: false,
    },
    {
      label: 'All documents',
      route: '/dashboard/documents',
      icon: 'description',
      exact: false,
    },
    {
      label: 'Needs review',
      route: '/dashboard/review',
      icon: 'rule',
      exact: false,
    },
    {
      label: 'Validated',
      route: '/dashboard/validated',
      icon: 'verified',
      exact: false,
    },
    {
      label: 'Rejected',
      route: '/dashboard/rejected',
      icon: 'cancel',
      exact: false,
    },
  ] as const;

  logout(): void {
    this.closeSidenavAfterNav();
    this.auth.logoutSession().subscribe({
      next: () => void this.router.navigateByUrl('/login'),
    });
  }
}
