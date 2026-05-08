// Time utilities — format dates/times in the user's local timezone automatically.
// All functions are timezone-aware: input timestamps are absolute (ISO / Date),
// output is rendered in the browser's local timezone using Intl.DateTimeFormat.

/** Combine a wall-clock show_date (YYYY-MM-DD) + show_time (HH:MM[:SS]) recorded
 *  in Asia/Jakarta (WIB, UTC+7) into an absolute Date that represents the same instant. */
export function showDateTimeToDate(showDate?: string | null, showTime?: string | null): Date | null {
  if (!showDate) return null;
  const time = (showTime || '00:00:00').padEnd(8, ':00').slice(0, 8);
  // Treat stored show_date+show_time as Asia/Jakarta wall-clock (UTC+7).
  const iso = `${showDate}T${time}+07:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Format a date in the user's local zone with a friendly label. */
export function formatLocalDateTime(
  input: string | number | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeStyle: 'short' },
): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZoneName: opts.timeZoneName ?? 'short' }).format(d);
  } catch { return d.toString(); }
}

export function formatLocalDate(input: string | number | Date | null | undefined): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch { return d.toString(); }
}

export function formatLocalTime(input: string | number | Date | null | undefined): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(d);
  } catch { return d.toString(); }
}

/** Get a friendly local timezone abbreviation (best-effort). */
export function userTimezoneLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date());
    const tz = parts.find(p => p.type === 'timeZoneName')?.value;
    return tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch { return ''; }
}

/** Compute remaining time to a target date. Returns days/hours/minutes/seconds. */
export function countdownTo(target: Date | string | number | null): { days: number; hours: number; minutes: number; seconds: number; past: boolean; diffMs: number } {
  const t = target ? (target instanceof Date ? target : new Date(target)) : null;
  if (!t || isNaN(t.getTime())) return { days: 0, hours: 0, minutes: 0, seconds: 0, past: true, diffMs: 0 };
  const diff = t.getTime() - Date.now();
  const past = diff <= 0;
  const safe = Math.max(0, diff);
  return {
    days: Math.floor(safe / 86400000),
    hours: Math.floor((safe % 86400000) / 3600000),
    minutes: Math.floor((safe % 3600000) / 60000),
    seconds: Math.floor((safe % 60000) / 1000),
    past,
    diffMs: diff,
  };
}
