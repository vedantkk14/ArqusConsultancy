import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { EmptyState } from '../empty-state/empty-state';

/** Placeholder for every sidebar page nobody has built yet. Reads its name from route `data.title`. */
@Component({
  selector: 'app-coming-soon-page',
  imports: [EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-empty-state
      icon="construction"
      [title]="name"
      message="We're still building this page. It will appear here soon."
    >
      <span class="badge">In development</span>
    </app-empty-state>
  `,
  styles: `
    .badge {
      margin-top: var(--space-2);
      padding: 4px var(--space-3);
      border-radius: var(--radius-pill);
      background: var(--ink);
      color: var(--brand);
      font-size: 0.6875rem;
      font-weight: 700;
      font-stretch: var(--font-wide);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
  `,
})
export class ComingSoonPage {
  protected readonly name = inject(ActivatedRoute).snapshot.data['title'] ?? 'This page';
}
