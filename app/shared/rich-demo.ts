import { createDashboard, createWidget, type Dashboard } from './dashboard.js';
import { dateKey, offsetDay, temperatureValue } from './ha-data.js';
import type { CalendarEvent, HistoryPoint, RichWidget, RichWidgetData } from './rich-widgets.js';

export function createHomePreview(cameras = false): Dashboard {
  const board = {
    ...createDashboard(),
    title: cameras ? 'A little closer to home.' : 'Home, connected.',
    subtitle: 'Fictional readings · Explore the Home Assistant widgets.',
  };
  const weather = {
    ...createWidget('ha-weather', 'demo-home-weather'),
    entityId: 'weather.demo_home',
    temperatureEntityId: 'sensor.demo_outdoor_temperature',
    humidityEntityId: 'sensor.demo_humidity',
    aqiEntityId: 'sensor.demo_aqi',
    sunEntityId: 'sun.sun',
    secondaryEntityId: 'weather.demo_city',
    secondarySource: 'home-assistant' as const,
  };
  const agenda = {
    ...createWidget('ha-agenda', 'demo-home-agenda'),
    calendars: [
      {
        entityId: 'calendar.demo_work',
        name: 'Work',
        color: '#82a9d1',
        reminders: true,
        excludeKeywords: '',
      },
      {
        entityId: 'calendar.demo_personal',
        name: 'Personal',
        color: '#c49fcf',
        reminders: false,
        excludeKeywords: '',
      },
    ],
  };
  const climate = {
    ...createWidget('ha-climate', 'demo-home-climate'),
    temperatures: [
      { entityId: 'climate.demo_upstairs', label: 'Upstairs' },
      { entityId: 'climate.demo_downstairs', label: 'Downstairs' },
    ],
    co2EntityId: 'sensor.demo_co2',
  };
  const readiness = {
    ...createWidget('ha-readiness', 'demo-home-readiness'),
    entityId: 'sensor.demo_readiness',
  };
  const camera = {
    ...createWidget('ha-camera', 'demo-home-camera'),
    entityId: 'camera.demo_front',
    motionEntityId: 'binary_sensor.demo_motion',
    width: 8 as const,
    height: 6 as const,
  };
  const status = {
    ...createWidget('ha-status', 'demo-home-status'),
    contacts: ['binary_sensor.demo_door', 'binary_sensor.demo_window'],
    motionEntityId: 'binary_sensor.demo_motion',
  };
  const frontCamera = {
    ...camera,
    id: 'demo-home-front',
    width: 4 as const,
    height: 2 as const,
    fit: 'cover' as const,
  };
  board.widgets = cameras
    ? [camera, status, readiness]
    : [weather, agenda, frontCamera, { ...climate, height: 2 }, { ...readiness, height: 2 }];
  board.allowDisplayInteractions = true;
  return board;
}

export function richPreview(
  widget: RichWidget,
  now = new Date(),
  units: 'celsius' | 'fahrenheit' = 'celsius',
): RichWidgetData {
  const today = dateKey(now, 'UTC'),
    end = now.getTime();
  const base = {
    phase: 'connected' as const,
    stale: false,
    updatedAt: now.toISOString(),
    warnings: [],
  };
  const points = (days: number, center: number, amplitude: number): HistoryPoint[] =>
    Array.from({ length: 49 }, (_, index) => ({
      time: end - (days * 86_400_000 * (48 - index)) / 48,
      value: center + amplitude * Math.sin(index / 5) + amplitude * 0.2 * Math.cos(index / 2),
    }));
  const temperature = (value: number | null) => temperatureValue(value, '°C', units);
  const unit = units === 'celsius' ? '°C' : '°F';
  const temperaturePoints = (center: number, amplitude: number) =>
    points(1, center, amplitude).map((point) => ({ ...point, value: temperature(point.value) }));
  if (widget.type === 'ha-weather') {
    const forecast = Array.from({ length: 7 }, (_, index) => ({
      date: offsetDay(today, index),
      condition: ['sunny', 'partlycloudy', 'cloudy', 'rainy', 'partlycloudy', 'sunny', 'sunny'][
        index
      ],
      high: temperature([21, 22, 20, 18, 20, 22, 23][index]),
      low: temperature([13, 14, 12, 12, 13, 14, 14][index]),
    }));
    return {
      ...base,
      type: widget.type,
      data: {
        current: {
          name: 'Outside',
          condition: 'partlycloudy',
          temperature: temperature(18),
          humidity: 62,
          unit,
          forecast,
          attribution: 'Fictional weather preview',
        },
        secondary: {
          name: 'Coastal city',
          condition: 'sunny',
          temperature: temperature(16),
          humidity: 58,
          unit,
          forecast,
          attribution: 'Fictional weather preview',
        },
        aqi: 24,
        sunset: `${today}T19:22:00Z`,
        sunrise: `${offsetDay(today, 1)}T06:14:00Z`,
        moon: { phase: 0.65, fraction: 0.79, name: 'Waning gibbous' },
      },
    };
  }
  if (widget.type === 'ha-agenda') {
    const event = (
      id: string,
      title: string,
      offset: number,
      hour: number,
      allDay = false,
    ): CalendarEvent => ({
      id,
      title,
      start: allDay
        ? `${offsetDay(today, offset)}T00:00:00Z`
        : `${offsetDay(today, offset)}T${String(hour).padStart(2, '0')}:00:00Z`,
      end: allDay
        ? `${offsetDay(today, offset + 1)}T00:00:00Z`
        : `${offsetDay(today, offset)}T${String(hour + 1).padStart(2, '0')}:00:00Z`,
      allDay,
      calendar: id === 'work' ? 'Work' : 'Personal',
      entityId: id === 'work' ? 'calendar.demo_work' : 'calendar.demo_personal',
      color: id === 'work' ? '#82a9d1' : '#c49fcf',
      description: 'An example event for the NoticeTV preview.',
      location: 'Fictional preview',
    });
    const meeting = {
      ...event('work', 'Designing what comes next', 0, 14),
      start: new Date(end + 48 * 60_000).toISOString(),
      end: new Date(end + 108 * 60_000).toISOString(),
    };
    const events = [
      meeting,
      event('dinner', 'Dinner with the usual suspects', 0, 19),
      event('walk', 'A walk, with no particular plan', 1, 8),
      event('market', 'The neighborhood farmers market', 2, 10),
      event('weekend', 'A little room to breathe', 3, 0, true),
    ];
    return {
      ...base,
      type: widget.type,
      data: {
        events,
        nextMeeting: meeting,
        rangeStart: `${today.slice(0, 8)}01T00:00:00Z`,
        rangeEnd: `${offsetDay(today, 8)}T00:00:00Z`,
      },
    };
  }
  if (widget.type === 'ha-climate')
    return {
      ...base,
      type: widget.type,
      data: {
        temperatures: [
          {
            id: 'climate.demo_upstairs',
            name: 'Upstairs',
            value: temperature(21.5),
            unit,
            updatedAt: now.toISOString(),
            points: temperaturePoints(21.3, 0.7),
          },
          {
            id: 'climate.demo_downstairs',
            name: 'Downstairs',
            value: temperature(20.2),
            unit,
            updatedAt: now.toISOString(),
            points: temperaturePoints(20.3, 0.4),
          },
        ],
        co2: {
          id: 'sensor.demo_co2',
          name: 'Indoor CO₂',
          value: 640,
          unit: 'ppm',
          updatedAt: now.toISOString(),
          points: points(1, 680, 120),
        },
        start: end - 86_400_000,
        end,
      },
    };
  if (widget.type === 'ha-readiness')
    return {
      ...base,
      type: widget.type,
      data: {
        score: { name: 'Readiness', value: 86, unit: null, updatedAt: now.toISOString() },
        points: [78, 70, 92, 86, 49, 67, 55, 86].map((value, index) => ({
          time: end - (7 - index) * 86_400_000,
          value,
        })),
        average: 72.875,
        start: end - 7 * 86_400_000,
        end,
      },
    };
  if (widget.type === 'ha-status')
    return {
      ...base,
      type: widget.type,
      data: {
        contacts: [
          { id: 'binary_sensor.demo_door', name: 'Front door', state: 'closed' },
          { id: 'binary_sensor.demo_window', name: 'Kitchen window', state: 'closed' },
        ],
        motion: 'clear',
      },
    };
  return {
    ...base,
    type: widget.type,
    data: { name: 'Front door', available: true, motion: 'clear' },
  };
}
