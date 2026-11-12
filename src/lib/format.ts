const month = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Accepts YYYY-MM or any ISO date/time. */
export function formatMonth(iso: string): string {
  return month.format(new Date(/^\d{4}-\d{2}$/.test(iso) ? `${iso}-01T00:00:00Z` : iso));
}

export function formatDay(iso: string): string {
  return day.format(new Date(iso));
}

export function joinList(items: readonly string[], conjunction: 'and' | 'or'): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1)}`;
}
