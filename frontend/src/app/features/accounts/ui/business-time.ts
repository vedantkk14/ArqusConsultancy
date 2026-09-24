/**
 * Dates and times are shown in the business time zone (Asia/Kolkata, UTC+5:30, no DST), whatever the
 * browser's zone is. Mirrors the helpers in features/leads (copied, not imported).
 */
export const BUSINESS_TZ = 'Asia/Kolkata';
const OFFSET_MIN = 330;
const DAY_MS = 86_400_000;

/** Calendar day number in IST. */
export function businessDay(date: Date | string): number {
  const ms = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  return Math.floor((ms + OFFSET_MIN * 60_000) / DAY_MS);
}

/** Today's date in IST as "YYYY-MM-DD" (the expense date default), `daysAgo` days back. */
export function businessDate(daysAgo = 0, now: Date = new Date()): string {
  return new Date((businessDay(now) - daysAgo) * DAY_MS).toISOString().slice(0, 10);
}

const DATE = new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TZ, day: 'numeric', month: 'short' });
const DATE_Y = new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TZ, day: 'numeric', month: 'short', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TZ, hour: 'numeric', minute: '2-digit' });
const FULL = new Intl.DateTimeFormat('en-IN', {
  timeZone: BUSINESS_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Absolute time for title attributes: "Thu, 24 Sept 2026, 5:00 pm". */
export function formatBusinessFull(iso: string | null | undefined): string {
  return iso ? FULL.format(new Date(iso)) : '';
}

/** "Today, 5:00 pm", "Yesterday, 1:30 am", "12 Oct, 3:00 pm" (IST). */
export function formatBusiness(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const diff = businessDay(date) - businessDay(now);
  const day =
    diff === 0
      ? 'Today'
      : diff === -1
        ? 'Yesterday'
        : date.getUTCFullYear() === now.getUTCFullYear()
          ? DATE.format(date)
          : DATE_Y.format(date);
  return `${day}, ${TIME.format(date).toLowerCase()}`;
}

/** A calendar date ("2026-09-24", no time zone involved) as "24 Sept 2026". Empty for null. */
export function formatDay(day: string | null | undefined): string {
  if (!day) {
    return '';
  }
  const [y, m, d] = day.split('-').map(Number);
  return DATE_Y.format(new Date(Date.UTC(y, m - 1, d, 6)));
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", "12 Oct". */
export function relativeLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) {
    return '';
  }
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) {
    return 'just now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24 && businessDay(iso) === businessDay(now)) {
    return `${hours} h ago`;
  }
  const days = businessDay(now) - businessDay(iso);
  if (days <= 1) {
    return 'yesterday';
  }
  if (days < 30) {
    return `${days} days ago`;
  }
  return DATE.format(new Date(iso));
}

/** "Due in 12 days", "Due today", "3 days overdue" for a "YYYY-MM-DD" date; '' when none. */
export function dueLabel(day: string | null | undefined, now: Date = new Date()): string {
  if (!day) {
    return '';
  }
  const [y, m, d] = day.split('-').map(Number);
  const diff = Math.floor(Date.UTC(y, m - 1, d) / DAY_MS) - businessDay(now);
  if (diff === 0) {
    return 'Due today';
  }
  return diff > 0 ? `Due in ${diff} ${diff === 1 ? 'day' : 'days'}` : `${-diff} ${-diff === 1 ? 'day' : 'days'} overdue`;
}
