const month = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Accepts YYYY-MM or any ISO date/time. */
export function formatMonth(iso: string): string {
  return month.format(new Date(/^\d{4}-\d{2}$/.test(iso) ? `${iso}-01T00:00:00Z` : iso));
}

export function formatDay(iso: string): string {
  return day.format(new Date(iso));
}

/** "23 June – 1 July 2026": the shared year, or month and year, is printed once; one day prints alone. */
export function formatDayRange(from: string, to: string): string {
  const [a, b] = [formatDay(from), formatDay(to)];
  if (a === b) return a;
  const [aDay, aMonth, aYear] = a.split(' ');
  const [bDay, bMonth, bYear] = b.split(' ');
  if (aYear !== bYear) return `${a} – ${b}`;
  if (aMonth !== bMonth) return `${aDay} ${aMonth} – ${b}`;
  return `${aDay}–${bDay} ${bMonth} ${bYear}`;
}

export function joinList(items: readonly string[], conjunction: 'and' | 'or'): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1)}`;
}
