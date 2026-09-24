/**
 * Follow-ups are entered and shown in the business time zone (Asia/Kolkata, UTC+5:30, no DST),
 * whatever the browser's zone is. Values travel as ISO strings with an offset.
 */
export const BUSINESS_TZ = 'Asia/Kolkata';
const OFFSET_MIN = 330;
const DAY_MS = 86_400_000;

/** "2026-09-24T01:30" (a local IST wall time, as from <input type=datetime-local>) -> ISO in UTC. */
export function toBusinessIso(local: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local ?? '');
  if (!match) {
    return null;
  }
  const [, y, mo, d, h, mi] = match.map(Number);
  const utc = Date.UTC(y, mo - 1, d, h, mi) - OFFSET_MIN * 60_000;
  return new Date(utc).toISOString();
}

/** ISO -> "2026-09-24T01:30" in IST, for a datetime-local input. */
export function toBusinessInput(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const t = new Date(new Date(iso).getTime() + OFFSET_MIN * 60_000);
  return t.toISOString().slice(0, 16);
}

/** Calendar day number in IST (for "today", "tomorrow", "3d overdue"). */
export function businessDay(date: Date | string): number {
  const ms = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  return Math.floor((ms + OFFSET_MIN * 60_000) / DAY_MS);
}

const TIME = new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TZ, hour: 'numeric', minute: '2-digit' });
const DATE = new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TZ, day: 'numeric', month: 'short' });
const DATE_Y = new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TZ, day: 'numeric', month: 'short', year: 'numeric' });
const FULL = new Intl.DateTimeFormat('en-IN', {
  timeZone: BUSINESS_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "Today, 5:00 pm", "Tomorrow, 10:00 am", "Yesterday, 1:30 am", "12 Oct, 3:00 pm" (IST). */
export function formatBusiness(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const diff = businessDay(date) - businessDay(now);
  const time = TIME.format(date).toLowerCase();
  const day =
    diff === 0
      ? 'Today'
      : diff === 1
        ? 'Tomorrow'
        : diff === -1
          ? 'Yesterday'
          : date.getUTCFullYear() === now.getUTCFullYear()
            ? DATE.format(date)
            : DATE_Y.format(date);
  return `${day}, ${time}`;
}

/** Absolute time for title attributes: "Thu, 24 Sept 2026, 5:00 pm". */
export function formatBusinessFull(iso: string | null | undefined): string {
  return iso ? FULL.format(new Date(iso)) : '';
}

/** A date at a given IST wall time, `days` business days from `now`. */
export function atBusinessTime(days: number, hour: number, minute = 0, now: Date = new Date()): string {
  const day = businessDay(now) + days;
  return new Date(day * DAY_MS + (hour * 60 + minute - OFFSET_MIN) * 60_000).toISOString();
}

/** Next Monday 10 am IST (a week away when today is Monday). */
export function nextMonday(hour = 10, now: Date = new Date()): string {
  const day = businessDay(now);
  const weekday = (day + 4) % 7; // day 0 (1 Jan 1970) was a Thursday; Monday = 1
  const ahead = ((8 - weekday) % 7) || 7;
  return atBusinessTime(ahead, hour, 0, now);
}

export interface FollowupState {
  kind: 'overdue' | 'today' | 'upcoming' | 'none';
  label: string;
}

/** "3d overdue" / "Today, 5:00 pm" / "Tomorrow, 10:00 am" / "No follow-up". */
export function followupState(iso: string | null | undefined, now: Date = new Date()): FollowupState {
  if (!iso) {
    return { kind: 'none', label: 'No follow-up' };
  }
  const when = new Date(iso);
  if (when.getTime() < now.getTime()) {
    const days = businessDay(now) - businessDay(when);
    return { kind: 'overdue', label: days >= 1 ? `${days}d overdue` : 'Overdue' };
  }
  const kind = businessDay(when) === businessDay(now) ? 'today' : 'upcoming';
  return { kind, label: formatBusiness(iso, now) };
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
