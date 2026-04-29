import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [MatCardModule],
  templateUrl: './dashboard-home.component.html',
  styleUrl: './dashboard-home.component.scss',
})
export class DashboardHomeComponent {
  readonly stats = [
    { label: 'Total documents', value: '—', hint: 'mock' },
    { label: 'Needs review', value: '—', hint: 'validation issues' },
    { label: 'Validated', value: '—', hint: 'confirmed' },
    { label: 'Rejected', value: '—', hint: 'final' },
  ] as const;
}
