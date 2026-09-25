import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PanelHead } from '../../components/panel-head';
import { UpcomingDay } from '../sales-exec-dashboard.models';

/** Next 7 business days, grouped by date. Empty days are already left out by the backend. */
@Component({
  selector: 'app-upcoming-card',
  imports: [PanelHead, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-labelledby': 'upcoming-title' },
  template: `
    <app-panel-head title="Coming up" subtitle="Next 7 days" headingId="upcoming-title" />
    @if (days().length) {
      <ol>
        @for (day of days(); track day.date) {
          <li>
            <span class="date">{{ day.label }}</span>
            <ul>
              @for (item of day.items; track item.id) {
                <li>
                  <a [routerLink]="['/leads', item.id]">{{ item.name }}</a>
                </li>
              }
            </ul>
            @if (day.count > day.items.length) {
              <span class="more">+{{ day.count - day.items.length }} more</span>
            }
          </li>
        }
      </ol>
    } @else {
      <p class="none">Nothing on the calendar for the next 7 days.</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      padding: var(--space-5);
    }
    ol {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    ol > li {
      padding-bottom: 10px;
      border-bottom: 1px solid var(--line);
    }
    ol > li:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }
    .date {
      display: block;
      margin-bottom: 4px;
      color: var(--ink-3);
      font-size: var(--text-xs);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    ol ul {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    ol ul a {
      color: var(--ink);
      font-size: var(--text-sm);
      text-decoration: none;
    }
    ol ul a:hover {
      color: var(--brand-deep);
      text-decoration: underline;
    }
    .more {
      display: block;
      margin-top: 4px;
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    .none {
      margin: 0;
      padding: 24px 4px;
      color: var(--ink-3);
      font-size: var(--text-sm);
      text-align: center;
    }
  `,
})
export class UpcomingCard {
  readonly upcoming = input.required<UpcomingDay[]>();

  protected readonly days = computed(() =>
    this.upcoming().map((day) => ({ ...day, label: this.dayLabel(day.date) })),
  );

  private dayLabel(iso: string): string {
    const date = new Date(`${iso}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);
    if (diffDays === 1) {
      return 'Tomorrow';
    }
    return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }
}
