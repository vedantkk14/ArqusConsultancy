const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09" -> "Sep". */
export function monthLabel(yearMonth: string): string {
  const month = Number(yearMonth.slice(5, 7));
  return MONTHS[month - 1] ?? yearMonth;
}
