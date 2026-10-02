import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EventEmitter,
  input,
  Output,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Holiday } from '../data/leave.models';

interface CalCell {
  id: string;
  day: number;
  dateStr: string;
  otherMonth: boolean;
  isToday: boolean;
  isHoliday: boolean;
  holidayName: string;
  isWeekend: boolean;
}

@Component({
  selector: 'app-leaves-calendar',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }

    /* ── Header ─────────────────────────────────── */
    .cal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }

    .cal-label {
      font-size: 18px;
      font-weight: 700;
      color: var(--ink);
      letter-spacing: -0.01em;
    }

    .nav-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .add-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--ink);
      border: 0;
      color: var(--on-ink);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s, transform 0.15s;
      box-shadow: 0 2px 6px rgba(11, 13, 15, 0.2);
    }
    .add-btn:hover { background: var(--ink-2); transform: scale(1.08); }
    .add-btn mat-icon { font-size: 18px; width: 18px; height: 18px; }

    .nav-btn {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink-2);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s;
    }
    .nav-btn:hover { background: var(--subtle); }
    .nav-btn mat-icon { font-size: 18px; width: 18px; height: 18px; }

    .today-btn {
      height: 30px;
      padding: 0 12px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    .today-btn:hover { background: var(--subtle); }

    /* ── Month title ─────────────────────────────── */
    .month-title {
      text-align: center;
      font-size: 15px;
      font-weight: 700;
      color: var(--ink);
      margin-bottom: 16px;
      letter-spacing: -0.01em;
    }

    /* ── Grid ────────────────────────────────────── */
    .grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
    }

    .day-name {
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      color: var(--ink-3);
      padding-bottom: 10px;
      letter-spacing: 0.03em;
    }

    .cell {
      text-align: center;
      padding: 10px 4px;
      font-size: 14px;
      font-weight: 400;
      color: var(--ink);
      border-top: 1px solid var(--line);
      user-select: none;
      font-variant-numeric: tabular-nums;
      transition: background 0.15s;
      position: relative;
    }

    .cell.clickable { cursor: pointer; }
    .cell.clickable:hover:not(.holiday) { background: var(--subtle); }

    /* Weekend dates */
    .cell.weekend:not(.holiday):not(.other-month) {
      color: var(--ink-2);
    }

    .cell.other-month { color: var(--ink-3); opacity: 0.45; }

    /* Today */
    .cell.today:not(.holiday) .num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--ink);
      color: var(--on-ink);
      font-weight: 700;
    }

    /* Holiday */
    .cell.holiday {
      background: rgba(229,57,53,0.1);
    }
    .cell.holiday .num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: #e53935;
      color: #fff;
      font-weight: 700;
    }

    /* Holiday tooltip label */
    .hol-label {
      display: block;
      font-size: 9px;
      color: #e53935;
      margin-top: 2px;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    /* ── Divider + legend ────────────────────────── */
    .footer {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--line);
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--ink-3);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #e53935;
    }
    .dot.today-dot {
      background: var(--ink);
      border: 2px solid var(--ink);
    }
  `,
  template: `
    <!-- Header -->
    <div class="cal-header">
      <span class="cal-label">Calendar</span>
      <div class="nav-group">
        @if (canAddHoliday()) {
          <button class="add-btn" type="button" title="Add holiday" (click)="dateSelected.emit('')">
            <mat-icon>add</mat-icon>
          </button>
        }
        <button class="nav-btn" type="button" (click)="prevMonth()">
          <mat-icon>chevron_left</mat-icon>
        </button>
        <button class="today-btn" type="button" (click)="goToToday()">Today</button>
        <button class="nav-btn" type="button" (click)="nextMonth()">
          <mat-icon>chevron_right</mat-icon>
        </button>
      </div>
    </div>

    <!-- Month/Year -->
    <div class="month-title">{{ monthName() }} {{ year() }}</div>

    <!-- Grid -->
    <div class="grid">
      @for (d of DAY_NAMES; track d) {
        <div class="day-name">{{ d }}</div>
      }

      @for (cell of cells(); track cell.id) {
        <div
          class="cell"
          [class.clickable]="canAddHoliday() && !cell.otherMonth"
          [class.holiday]="cell.isHoliday"
          [class.today]="cell.isToday"
          [class.other-month]="cell.otherMonth"
          [class.weekend]="cell.isWeekend"
          (click)="onCellClick(cell)"
          [title]="cell.holidayName || (canAddHoliday() && !cell.otherMonth ? 'Click to add holiday' : '')"
        >
          <span class="num">{{ cell.day }}</span>
          @if (cell.holidayName) {
            <span class="hol-label">{{ cell.holidayName }}</span>
          }
        </div>
      }
    </div>

    <!-- Footer legend -->
    @if (holidays().length > 0 || canAddHoliday()) {
      <div class="footer">
        <span class="legend-item"><span class="dot"></span>Holiday</span>
        @if (canAddHoliday()) {
          <span class="legend-item" style="color: var(--ink-3); font-size: 12px;">
            Click any date to mark as holiday
          </span>
        }
      </div>
    }
  `,
})
export class LeavesCalendar {
  readonly holidays = input<Holiday[]>([]);
  readonly canAddHoliday = input(false);
  @Output() dateSelected = new EventEmitter<string>();

  protected readonly DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  protected readonly current = signal(new Date());

  protected readonly monthName = computed(() =>
    this.current().toLocaleString('default', { month: 'long' })
  );
  protected readonly year = computed(() => this.current().getFullYear());

  protected readonly cells = computed<CalCell[]>(() => {
    const d = this.current();
    const year = d.getFullYear();
    const month = d.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const today = new Date();
    const todayStr = fmt(today.getFullYear(), today.getMonth() + 1, today.getDate());

    const holidayMap = new Map(this.holidays().map((h) => [h.date, h.name]));
    const cells: CalCell[] = [];

    for (let i = firstDay - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      cells.push({ id: `prev-${i}`, day, dateStr: '', otherMonth: true, isToday: false, isHoliday: false, holidayName: '', isWeekend: false });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = fmt(year, month + 1, i);
      const hName = holidayMap.get(dateStr) ?? '';
      const dow = new Date(year, month, i).getDay();
      cells.push({
        id: dateStr,
        day: i,
        dateStr,
        otherMonth: false,
        isToday: dateStr === todayStr,
        isHoliday: !!hName,
        holidayName: hName,
        isWeekend: dow === 0 || dow === 6,
      });
    }

    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push({ id: `next-${i}`, day: i, dateStr: '', otherMonth: true, isToday: false, isHoliday: false, holidayName: '', isWeekend: false });
    }

    return cells;
  });

  protected prevMonth() {
    const d = this.current();
    this.current.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  protected nextMonth() {
    const d = this.current();
    this.current.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
  protected goToToday() {
    this.current.set(new Date());
  }
  protected onCellClick(cell: CalCell) {
    if (this.canAddHoliday() && !cell.otherMonth) {
      this.dateSelected.emit(cell.dateStr);
    }
  }
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
