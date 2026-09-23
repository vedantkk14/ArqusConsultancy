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
      [title]="'Coming soon: ' + name"
      message="This page is a placeholder. Replace its route with a real component."
    />
  `,
})
export class ComingSoonPage {
  protected readonly name = inject(ActivatedRoute).snapshot.data['title'] ?? 'This page';
}
