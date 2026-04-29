import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-dashboard-section',
  standalone: true,
  imports: [MatCardModule],
  templateUrl: './dashboard-section.component.html',
  styleUrl: './dashboard-section.component.scss',
})
export class DashboardSectionComponent {
  private readonly route = inject(ActivatedRoute);

  readonly title = toSignal(
    this.route.data.pipe(map((d) => String(d['title'] ?? 'Section'))),
    { initialValue: String(this.route.snapshot.data['title'] ?? '') },
  );
}
