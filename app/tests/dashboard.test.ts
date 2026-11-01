import { describe, expect, it } from 'vitest';
import {
  createDashboard,
  createDemoDashboard,
  createWidget,
  dashboardSchema,
  layoutWidgets,
} from '../shared/dashboard';
import { themeIds } from '../shared/themes';
import { secondaryWeatherSource, widgetEntityIds } from '../shared/rich-widgets';

describe('portable dashboard documents', () => {
  it('starts with an empty, usable dashboard without personal settings or invented live readings', () => {
    const board = dashboardSchema.parse(createDashboard());
    expect(board.timeZone).toBe('UTC');
    expect(board.hideCursor).toBe(false);
    expect(board.theme).toBe('graphite');
    expect(dashboardSchema.parse({ ...board, theme: undefined }).theme).toBe('graphite');
    expect(dashboardSchema.parse({ ...board, hideCursor: undefined }).hideCursor).toBe(false);
    expect(board.widgets.find((widget) => widget.type === 'weather')).toMatchObject({
      latitude: null,
      longitude: null,
    });
    expect(board.widgets.find((widget) => widget.type === 'video')).toMatchObject({ url: '' });
    expect(board.widgets.find((widget) => widget.type === 'agenda')).toMatchObject({ events: [] });
  });

  it('keeps theme choices portable and rejects unknown themes', () => {
    for (const theme of themeIds) {
      const board = { ...createDashboard(), theme };
      expect(dashboardSchema.parse(JSON.parse(JSON.stringify(board))).theme).toBe(theme);
    }
    expect(dashboardSchema.safeParse({ ...createDashboard(), theme: 'unknown' }).success).toBe(
      false,
    );
  });

  it('keeps weather sensor selections portable and accepts layouts saved before the selector existed', () => {
    const weather = createWidget('weather');
    const parse = (temperatureEntityId: unknown) =>
      dashboardSchema.safeParse({
        ...createDashboard(),
        widgets: [{ ...weather, temperatureEntityId }],
      });
    const legacy = parse(undefined);
    expect(legacy.success && legacy.data.widgets[0]).toMatchObject({ temperatureEntityId: '' });
    const selected = parse('sensor.outdoor_temperature');
    expect(selected.success && selected.data.widgets[0]).toMatchObject({
      temperatureEntityId: 'sensor.outdoor_temperature',
    });
    for (const id of ['weather.home', 'binary_sensor.front_door', 'sensor.invalid/path'])
      expect(parse(id).success).toBe(false);
  });

  it('preserves older second-location entities and validates portable city selections', () => {
    const weather = createWidget('ha-weather');
    const old = {
      ...weather,
      secondarySource: undefined,
      secondaryLocation: undefined,
      secondaryEntityId: 'weather.other',
    };
    const board = dashboardSchema.parse({ ...createDashboard(), widgets: [old] });
    const saved = board.widgets[0];
    if (saved.type !== 'ha-weather') throw new Error('Expected home weather');
    expect(secondaryWeatherSource(saved)).toBe('home-assistant');
    expect(saved.secondaryLocation).toBeNull();
    expect(widgetEntityIds(saved)).toContain('weather.other');
    const location = { location: 'Fixture city', latitude: 0, longitude: 0 };
    for (const source of ['location', 'off'] as const) {
      const selected = { ...saved, secondarySource: source, secondaryLocation: location };
      expect(widgetEntityIds(selected)).not.toContain('weather.other');
      expect(dashboardSchema.parse({ ...board, widgets: [selected] }).widgets[0]).toEqual(selected);
    }
    for (const invalid of [
      { ...location, latitude: 91 },
      { ...location, longitude: -181 },
      { ...location, location: '' },
    ])
      expect(
        dashboardSchema.safeParse({ ...board, widgets: [{ ...saved, secondaryLocation: invalid }] })
          .success,
      ).toBe(false);
  });

  it('rejects executable URLs, embedded credentials, duplicate widgets, and impossible dates', () => {
    const board = createDashboard();
    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'https://user:password@example.com/live.m3u8',
    ]) {
      expect(
        dashboardSchema.safeParse({ ...board, widgets: [{ ...createWidget('video'), url }] })
          .success,
      ).toBe(false);
    }
    expect(
      dashboardSchema.safeParse({ ...board, widgets: [board.widgets[0], board.widgets[0]] })
        .success,
    ).toBe(false);
    const agenda = createWidget('agenda');
    expect(
      dashboardSchema.safeParse({
        ...board,
        widgets: [
          {
            ...agenda,
            events: [{ id: 'event', title: 'Invalid', calendar: '', start: '2026-02-30T12:00' }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts local HLS streams and leap-day events without requiring a specific household', () => {
    const board = createDashboard();
    expect(
      dashboardSchema.safeParse({
        ...board,
        widgets: [{ ...createWidget('video'), url: 'http://camera.local/live.m3u8' }],
      }).success,
    ).toBe(true);
    expect(
      dashboardSchema.safeParse({
        ...board,
        widgets: [
          {
            ...createWidget('agenda'),
            events: [{ id: 'event', title: 'Leap day', calendar: '', start: '2028-02-29T12:00' }],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('fits the starter into a complete six-row layout with no overlapping widgets', () => {
    const placements = layoutWidgets(createDashboard().widgets);
    const cells = new Set<string>();
    for (const placement of placements) {
      expect(placement.row + placement.height - 1).toBeLessThanOrEqual(6);
      for (let y = placement.row; y < placement.row + placement.height; y++) {
        for (let x = placement.column; x < placement.column + placement.width; x++) {
          const cell = `${x}:${y}`;
          expect(cells.has(cell)).toBe(false);
          cells.add(cell);
        }
      }
    }
    expect(cells.size).toBe(72);
  });

  it('keeps the demo fictional and self-contained with no remote media URLs', () => {
    const demo = dashboardSchema.parse(createDemoDashboard(new Date('2026-10-31T12:00:00Z')));
    expect(demo.widgets.find((widget) => widget.type === 'video')).toMatchObject({ url: '' });
    expect(demo.widgets.find((widget) => widget.type === 'weather')).toMatchObject({
      latitude: null,
      longitude: null,
    });
    expect(JSON.stringify(demo)).not.toMatch(/https?:\/\//);
  });
});
