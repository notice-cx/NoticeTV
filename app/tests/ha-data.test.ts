import { describe, expect, it } from 'vitest';
import {
  calendarMidnight,
  calendarRange,
  dailyForecast,
  dateKey,
  historyPath,
  liveSeries,
  nextMeeting,
  normalizeEvents,
  numeric,
  recordedSeries,
  temperatureValue,
} from '../shared/ha-data';
import {
  createDashboard,
  createWidget,
  createHomeWidgets,
  dashboardSchema,
  layoutWidgets,
} from '../shared/dashboard';
import { createHomePreview } from '../shared/rich-demo';
import { isRichWidget, widgetEntityIds } from '../shared/rich-widgets';
import { sunSchedule } from '../server/ha-widgets';

const source = {
  entityId: 'calendar.fixture',
  name: 'Work',
  color: '#82a9d1',
  reminders: true,
  excludeKeywords: 'blocked phrase',
};
const agenda = { ...createWidget('ha-agenda'), calendars: [source] };

describe('calendar behavior carried from the home dashboard', () => {
  it('uses local midnights across daylight saving changes, including exclusive all-day ends', () => {
    const zone = 'America/Los_Angeles';
    expect(calendarMidnight('2026-11-01', zone).toISOString()).toBe('2026-11-01T07:00:00.000Z');
    expect(calendarMidnight('2026-11-02', zone).toISOString()).toBe('2026-11-02T08:00:00.000Z');
    const events = normalizeEvents(
      [
        [
          {
            summary: 'All-day fixture',
            start: { date: '2026-11-01' },
            end: { date: '2026-11-02' },
          },
        ],
      ],
      agenda,
      new Date('2026-11-01T08:00Z'),
      zone,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      allDay: true,
      start: '2026-11-01T07:00:00.000Z',
      end: '2026-11-02T08:00:00.000Z',
    });
  });

  it('preserves filters, duplicate handling, calendar labels, and plain-text event details', () => {
    const event = {
      summary: 'Planning',
      start: '2026-11-01T10:00:00Z',
      end: '2026-11-01T11:00:00Z',
      description: '<script>fixture</script>',
      location: 'Fixture room',
    };
    const rows = [
      event,
      { ...event, status: 'cancelled' },
      { ...event, summary: 'Declined', attendees: [{ self: true, responseStatus: 'declined' }] },
      { ...event, summary: 'Blocked phrase example' },
      { ...event, summary: 'Finished', start: '2026-11-01T08:00:00Z', end: '2026-11-01T09:00:00Z' },
      { ...event, summary: 'Multi-day', end: '2026-11-03T11:00:00Z' },
    ];
    const config = {
      ...agenda,
      calendars: [source, { ...source, entityId: 'calendar.other', name: 'Other' }],
    };
    const now = new Date('2026-11-01T09:30Z');
    const filtered = normalizeEvents([rows, [event]], config, now, 'UTC');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({
      title: 'Planning',
      calendar: 'Work',
      color: source.color,
      description: '<script>fixture</script>',
    });
    expect(
      normalizeEvents(
        [rows, [event]],
        {
          ...config,
          hideDuplicates: false,
          hideDeclined: false,
          hideFinished: false,
          showMultiDay: true,
        },
        now,
        'UTC',
      ),
    ).toHaveLength(5);
  });

  it('limits meeting reminders to chosen calendars and the next three hours, excluding TV schedules', () => {
    const now = new Date('2026-11-01T09:30Z');
    const rows = [
      { summary: 'Next meeting', start: '2026-11-01T10:00Z', end: '2026-11-01T11:00Z' },
      { summary: 'Later meeting', start: '2026-11-01T14:00Z', end: '2026-11-01T15:00Z' },
    ];
    const events = normalizeEvents([rows], agenda, now, 'UTC');
    expect(nextMeeting(events, agenda.calendars, now)?.title).toBe('Next meeting');
    expect(nextMeeting(events, [{ ...source, reminders: false }], now)).toBeNull();
    expect(
      nextMeeting(
        events.map((event) => ({ ...event, calendar: 'TV schedule' })),
        agenda.calendars,
        now,
      ),
    ).toBeNull();
    const range = calendarRange(new Date('2026-11-30T23:30Z'), 'UTC');
    expect(range.start).toBe('2026-11-01T00:00:00.000Z');
    expect(Date.parse(range.end)).toBeGreaterThan(Date.parse('2026-12-01T02:30Z'));
  });
});

describe('weather and recorder interpretation', () => {
  it('keeps missing and malformed readings unavailable while accepting real zeroes', () => {
    expect(numeric('0')).toBe(0);
    for (const value of [
      null,
      undefined,
      '',
      '   ',
      'unknown',
      'unavailable',
      false,
      [],
      {},
      'Infinity',
    ])
      expect(numeric(value)).toBeNull();
  });

  it('aggregates hourly and twice-daily forecasts into the dashboard’s local days', () => {
    const result = dailyForecast(
      [
        { datetime: '2026-11-01T06:00Z', temperature: 10 },
        { datetime: '2026-11-01T08:00Z', temperature: 12 },
        { datetime: '2026-11-01T19:00Z', temperature: 20 },
        { datetime: '2026-11-02T08:00Z', temperature: 19, templow: 9 },
      ],
      'America/Los_Angeles',
      new Date('2026-11-01T09:30Z'),
    );
    expect(result).toMatchObject([
      { date: '2026-11-01', low: 12, high: 20 },
      { date: '2026-11-02', low: 9, high: 19 },
    ]);
  });

  it('converts supported temperature units and rejects unknown units', () => {
    expect(temperatureValue(68, '°F', 'celsius')).toBe(20);
    expect(temperatureValue(20, '°C', 'fahrenheit')).toBe(68);
    expect(temperatureValue(293.15, 'K', 'celsius')).toBe(20);
    expect(temperatureValue(null, '°C', 'fahrenheit')).toBeNull();
    expect(temperatureValue(20, 'unexpected', 'celsius')).toBeNull();
  });

  it('uses recorder last_updated for thermostat attributes and does not join unavailable gaps', () => {
    const data = [
      [
        {
          entity_id: 'climate.fixture',
          state: 'heat',
          attributes: { current_temperature: 20 },
          last_changed: '2026-11-01T00:00Z',
          last_updated: '2026-11-01T01:00Z',
        },
        {
          state: 'unavailable',
          last_changed: '2026-11-01T00:00Z',
          last_updated: '2026-11-01T02:00Z',
        },
        {
          state: 'heat',
          attributes: { current_temperature: 22 },
          last_changed: '2026-11-01T00:00Z',
          last_updated: '2026-11-01T03:00Z',
        },
      ],
      [{ entity_id: 'sensor.private', state: '9000', last_updated: '2026-11-01T04:00Z' }],
    ];
    const points = recordedSeries(data, 'climate.fixture', 'current_temperature');
    expect(points.map((point) => point.value)).toEqual([20, null, 22]);
    expect(points.map((point) => point.time)).toEqual(
      ['01', '02', '03'].map((hour) => Date.parse(`2026-11-01T${hour}:00Z`)),
    );
    const plot = historyPath(points, points[0].time, points[2].time, 19, 23);
    expect(plot.match(/M/g)).toHaveLength(2);
    expect(liveSeries([], 21, 0, 100)).toEqual([]);
    expect(
      liveSeries(points, null, points[0].time, points[2].time + 1000).at(-1)?.value,
    ).toBeNull();
  });

  it('calculates today’s sunset after dark and tomorrow’s sunrise without exposing coordinates', () => {
    const zone = 'America/Los_Angeles';
    const result = sunSchedule(
      new Date('2026-10-29T05:00Z'),
      zone,
      { latitude: 37.77, longitude: -122.41 },
      { next_setting: '2026-10-30T01:14Z', next_rising: '2026-10-29T14:32Z' },
    );
    expect(dateKey(new Date(result.sunset!), zone)).toBe('2026-10-28');
    expect(result.sunrise).toBe('2026-10-29T14:32:00.000Z');
    expect(
      sunSchedule(new Date('2026-12-21T12:00Z'), 'UTC', { latitude: 89, longitude: 0 }),
    ).toMatchObject({ sunrise: null, sunset: null });
    expect(sunSchedule(new Date('2026-10-26T04:12Z'), 'UTC', {}).moon).toMatchObject({
      name: 'Full moon',
    });
  });
});

describe('portable rich widget configuration', () => {
  it('preserves old layouts, validates source domains, and enumerates only explicit selections', () => {
    const old = { ...createDashboard(), allowDisplayInteractions: undefined };
    expect(dashboardSchema.parse(old).allowDisplayInteractions).toBe(false);
    for (const board of [createHomePreview(), createHomePreview(true)]) {
      expect(dashboardSchema.parse(board)).toEqual(board);
      for (const widget of board.widgets) {
        expect(isRichWidget(widget)).toBe(true);
        expect(widgetEntityIds(widget).every((id) => id.includes('.'))).toBe(true);
      }
    }
    expect(
      dashboardSchema.safeParse({
        ...createDashboard(),
        widgets: [{ ...createWidget('ha-camera'), entityId: 'sensor.private' }],
      }).success,
    ).toBe(false);
    expect(
      dashboardSchema.safeParse({
        ...createDashboard(),
        widgets: [{ ...agenda, calendars: [source, source] }],
      }).success,
    ).toBe(false);
  });

  it('starts the Home layout with empty sources and fits its five cards into six rows', () => {
    const widgets = createHomeWidgets();
    expect(widgets).toHaveLength(5);
    expect(widgets.flatMap(widgetEntityIds)).toEqual([]);
    expect(dashboardSchema.safeParse({ ...createDashboard(), widgets }).success).toBe(true);
    expect(
      Math.max(...layoutWidgets(widgets).map((placement) => placement.row + placement.height - 1)),
    ).toBe(6);
  });
});
