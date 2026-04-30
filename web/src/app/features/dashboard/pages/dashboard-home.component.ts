import { Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { DocumentService } from '../../documents/services/document.service';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [MatCardModule],
  templateUrl: './dashboard-home.component.html',
  styleUrl: './dashboard-home.component.scss',
})
export class DashboardHomeComponent {
  private readonly documents = inject(DocumentService);

  readonly stats = computed(() => {
    const c = this.documents.summaryCounts();
    return [
      { label: 'Total documents', value: String(c.total), hint: 'All statuses' },
      { label: 'Needs review', value: String(c.needsReview), hint: 'Validation issues' },
      { label: 'Validated', value: String(c.validated), hint: 'Confirmed' },
      { label: 'Rejected', value: String(c.rejected), hint: 'Final' },
    ];
  });
}
