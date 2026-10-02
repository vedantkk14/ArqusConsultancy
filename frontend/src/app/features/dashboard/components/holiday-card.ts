import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { Holiday } from '../../leaves/data/leave.models';
import { LeavesApi } from '../../leaves/data/leaves-api.service';
import { PanelHead } from './panel-head';

/**
 * Shared dashboard card showing the upcoming holidays list.
 */
@Component({
  selector: 'app-holiday-card',
  imports: [MatIconModule, PanelHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-labelledby': 'holiday-title' },
  template: `
    <app-panel-head title="Holidays" subtitle="Upcoming team holidays" link="/leaves" linkLabel="View all" headingId="holiday-title" />
    <ul class="hol-list">
      @for (h of displayedHolidays(); track h.id) {
        <li class="hol-item">
          <div class="hol-info">
            <span class="hol-name">{{ h.name }}</span>
            <span class="hol-date">
              <mat-icon class="hol-icon" aria-hidden="true">calendar_today</mat-icon>
              {{ h.date }}
            </span>
          </div>
        </li>
      } @empty {
        <li class="none">No upcoming holidays listed.</li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      padding: var(--space-5);
    }
    ul.hol-list {
      margin: 0;
      padding: 0;
      list-style: none;
      max-height: 240px;
      overflow-y: auto;
    }
    .hol-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--line);
    }
    .hol-item:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }
    .hol-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .hol-name {
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--ink);
    }
    .hol-date {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: var(--text-xs);
      color: var(--ink-3);
    }
    .hol-icon {
      font-size: 13px;
      width: 13px;
      height: 13px;
    }
    .none {
      color: var(--ink-3);
      font-size: var(--text-sm);
      margin: 0;
      list-style: none;
    }
  `,
})
export class HolidayCard {
  private readonly leavesApi = inject(LeavesApi);

  readonly holidays = input<Holiday[] | null>(null);

  private readonly fetchedHolidays = toSignal(this.leavesApi.holidays(), { initialValue: [] });

  protected readonly displayedHolidays = computed(() => {
    const inputList = this.holidays();
    if (inputList !== null) return inputList;
    return this.fetchedHolidays();
  });
}
