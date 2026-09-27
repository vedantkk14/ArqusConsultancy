/** "Alice Admin" -> "Alice". Falls back to the whole name (or "there") when it has no spaces. */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first || 'there';
}

/** Time-of-day greeting in the user's local time. */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}
