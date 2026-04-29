import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

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
    void this.router.navigateByUrl('/login');
  }
}
