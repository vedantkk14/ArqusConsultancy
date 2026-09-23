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
      [title]="name + ' is on the way'"
      message="This page hasn't been built yet. It will appear here once it's ready."
    >
      <span class="chip">In development</span>
    </app-empty-state>
  `,
  styles: `
    .chip {
      margin-top: 10px;
      padding: 2px 10px;
      border: 1px solid var(--line);
      border-radius: var(--radius-pill);
      background: var(--subtle);
      color: var(--ink-2);
      font-size: var(--text-xs);
      font-weight: 500;
    }
  `,
})
export class ComingSoonPage {
  protected readonly name = inject(ActivatedRoute).snapshot.data['title'] ?? 'This page';
}
