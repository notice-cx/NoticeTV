import type { CalendarEvent, ForecastDay, HistoryPoint } from './rich-widgets.js';
import type { z } from 'zod';
import type { connectedAgendaSchema } from './rich-widgets.js';

export const numeric = (value: unknown): number | null =>
  !['string', 'number'].includes(typeof value) ||
  (typeof value === 'string' && !value.trim()) ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);
export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const text = (value: unknown, limit = 500) =>
  typeof value === 'string' ? value.slice(0, limit) : '';
export function temperatureValue(
  value: number | null,
  unit: string | null,
  target: 'celsius' | 'fahrenheit',
): number | null {
  if (value === null) return null;
  const celsius =
    unit === '°C'
      ? value
      : unit === '°F'
        ? ((value - 32) * 5) / 9
        : unit === 'K' || unit === '°K'
          ? value - 273.15
          : null;
  return celsius === null ? null : target === 'celsius' ? celsius : (celsius * 9) / 5 + 32;
}
export function dateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const p = (name: string) => parts.find((part) => part.type === name)!.value;
  return `${p('year')}-${p('month')}-${p('day')}`;
}
export function offsetDay(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function calendarMidnight(key: string, timeZone: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const p = (name: string) => Number(parts.find((part) => part.type === name)!.value);
    instant +=
      target - Date.UTC(p('year'), p('month') - 1, p('day'), p('hour'), p('minute'), p('second'));
  }
  return new Date(instant);
}
export function calendarRange(now: Date, timeZone: string) {
  const today = dateKey(now, timeZone);
  const month = new Date(`${today.slice(0, 8)}01T12:00:00Z`);
  month.setUTCMonth(month.getUTCMonth() + 1);
  const endDay = [month.toISOString().slice(0, 10), offsetDay(today, 8)].sort().at(-1)!;
  return {
    start: calendarMidnight(`${today.slice(0, 8)}01`, timeZone).toISOString(),
    end: calendarMidnight(endDay, timeZone).toISOString(),
  };
}
function eventDate(value: unknown, timeZone: string): Date | null {
  const record = asRecord(value);
  const raw = typeof value === 'string' ? value : text(record.dateTime || record.date);
  if (!raw) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? calendarMidnight(raw, timeZone) : new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}
export function normalizeEvents(
  results: unknown[],
  widget: z.infer<typeof connectedAgendaSchema>,
  now: Date,
  timeZone: string,
): CalendarEvent[] {
  const unique = new Map<string, CalendarEvent>();
  results.forEach((result, index) => {
    const source = widget.calendars[index];
    if (!source || !Array.isArray(result)) return;
    const excluded = source.excludeKeywords
      .split(',')
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean);
    for (const value of result) {
      const event = asRecord(value);
      const start = eventDate(event.start ?? event.dtstart, timeZone),
        end = eventDate(event.end ?? event.dtend, timeZone);
      if (
        !start ||
        !end ||
        end <= start ||
        event.status === 'cancelled' ||
        (widget.hideFinished && end <= now)
      )
        continue;
      if (
        widget.hideDeclined &&
        (event.status === 'declined' ||
          (Array.isArray(event.attendees) &&
            event.attendees.some(
              (person) => asRecord(person).self && asRecord(person).responseStatus === 'declined',
            )))
      )
        continue;
      const title = text(event.summary, 200) || 'Untitled event';
      if (excluded.some((word) => title.toLowerCase().includes(word))) continue;
      const rawStart = event.start ?? event.dtstart;
      const allDay =
        typeof rawStart === 'string'
          ? /^\d{4}-\d{2}-\d{2}$/.test(rawStart)
          : !!asRecord(rawStart).date;
      if (
        !widget.showMultiDay &&
        dateKey(start, timeZone) !== dateKey(new Date(end.getTime() - 1), timeZone)
      )
        continue;
      const key = `${title.toLowerCase().trim()}|${start.toISOString()}|${end.toISOString()}${widget.hideDuplicates ? '' : `|${source.entityId}`}`;
      if (!unique.has(key))
        unique.set(key, {
          id: `${source.entityId}|${key}`,
          title,
          start: start.toISOString(),
          end: end.toISOString(),
          allDay,
          calendar: source.name || source.entityId,
          entityId: source.entityId,
          color: source.color,
          description: text(event.description, 3000),
          location: text(event.location, 300),
        });
    }
  });
  return [...unique.values()]
    .sort((a, b) => a.start.localeCompare(b.start) || Number(b.allDay) - Number(a.allDay))
    .slice(0, 500);
}
export function nextMeeting(
  events: CalendarEvent[],
  calendars: { entityId: string; reminders: boolean }[],
  now: Date,
): CalendarEvent | null {
  const allowed = new Set(
    calendars.filter((source) => source.reminders).map((source) => source.entityId),
  );
  return (
    events.find(
      (event) =>
        !event.allDay &&
        allowed.has(event.entityId) &&
        !/(?:^|[_ .-])(?:tv|television)(?:[_ .-]|$)/i.test(`${event.entityId} ${event.calendar}`) &&
        Date.parse(event.start) >= now.getTime() &&
        Date.parse(event.start) <= now.getTime() + 3 * 3600_000,
    ) || null
  );
}
export function dailyForecast(rows: unknown[], timeZone: string, now: Date): ForecastDay[] {
  const days = new Map<string, ForecastDay>();
  const today = dateKey(now, timeZone);
  for (const row of rows) {
    const value = asRecord(row),
      instant = new Date(text(value.datetime));
    if (!Number.isFinite(instant.getTime())) continue;
    const key = dateKey(instant, timeZone);
    if (key < today) continue;
    const high = numeric(value.temperature),
      low = numeric(value.templow) ?? high;
    const day = days.get(key);
    if (!day) days.set(key, { date: key, condition: text(value.condition, 60), high, low });
    else {
      if (high !== null) day.high = day.high === null ? high : Math.max(day.high, high);
      if (low !== null) day.low = day.low === null ? low : Math.min(day.low, low);
    }
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
}
export function recordedSeries(
  data: unknown,
  entityId: string,
  attribute = 'state',
  mapValue: (value: number | null, attributes: Record<string, unknown>) => number | null = (
    value,
  ) => value,
): HistoryPoint[] {
  if (!Array.isArray(data)) return [];
  const rows = data.flatMap((group) =>
    Array.isArray(group) && group.some((row) => asRecord(row).entity_id === entityId) ? group : [],
  );
  const points = new Map<number, HistoryPoint>();
  for (const raw of rows) {
    const row = asRecord(raw);
    if (row.entity_id && row.entity_id !== entityId) continue;
    const time = Date.parse(text(row.last_updated || row.last_changed));
    if (!Number.isFinite(time)) continue;
    const value = ['unknown', 'unavailable'].includes(text(row.state))
      ? null
      : numeric(attribute === 'state' ? row.state : asRecord(row.attributes)[attribute]);
    points.set(time, { time, value: mapValue(value, asRecord(row.attributes)) });
  }
  const sorted = [...points.values()].sort((a, b) => a.time - b.time);
  const stride = Math.max(1, Math.ceil(sorted.length / 1800));
  // Keep unavailable transitions even when thinning a high-frequency recorder series.
  return sorted.filter(
    (point, index) =>
      index % stride === 0 ||
      index === sorted.length - 1 ||
      (point.value === null) !== (sorted[index - 1]?.value === null),
  );
}
export function liveSeries(
  points: HistoryPoint[],
  current: number | null,
  start: number,
  end: number,
): HistoryPoint[] {
  if (!points.some((point) => point.value !== null)) return [];
  const initial = points.filter((point) => point.time < start).at(-1);
  const window = points
    .filter((point) => point.time >= start && point.time <= end)
    .map((point) => ({ ...point }));
  if (initial) window.unshift({ ...initial, time: start });
  if (window.length && window.at(-1)!.time < end) window.push({ time: end, value: current });
  return window;
}
export function historyPath(
  points: HistoryPoint[],
  start: number,
  end: number,
  low: number,
  high: number,
  width = 360,
  height = 80,
): string {
  let active = false;
  return points
    .map((point) => {
      if (point.value === null) {
        active = false;
        return '';
      }
      const x =
        2 + Math.max(0, Math.min(1, (point.time - start) / (end - start || 1))) * (width - 4);
      const y = height - 5 - ((point.value - low) / (high - low || 1)) * (height - 10);
      const segment = `${active ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
      active = true;
      return segment;
    })
    .filter(Boolean)
    .join(' ');
}
