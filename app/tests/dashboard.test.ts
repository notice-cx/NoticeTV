import { describe, expect, it } from 'vitest';
import {
  createDashboard,
  createDemoDashboard,
  createWidget,
  dashboardSchema,
  layoutWidgets,
} from '../shared/dashboard';
import { themeIds } from '../shared/themes';

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
