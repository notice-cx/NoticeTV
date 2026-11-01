import { z } from 'zod';
import { defaultTheme, themeIds } from './themes.js';
import { entityIdSchema } from './home-assistant.js';
import {
  homeWeatherSchema,
  connectedAgendaSchema,
  indoorClimateSchema,
  readinessSchema,
  homeStatusSchema,
  cameraSchema,
} from './rich-widgets.js';

const text = (length: number) => z.string().trim().max(length);
const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Use a complete http:// or https:// address without an embedded username or password.');

const base = {
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  title: text(80).min(1),
  width: z.union([
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(8),
    z.literal(12),
  ]),
  height: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6)]),
};

function validLocalDateTime(value: string) {
  const date = new Date(`${value}:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value;
}

export const widgetSchema = z.discriminatedUnion('type', [
  homeWeatherSchema.extend(base),
  connectedAgendaSchema.extend(base),
  indoorClimateSchema.extend(base),
  readinessSchema.extend(base),
  homeStatusSchema.extend(base),
  cameraSchema.extend(base),
  z.object({
    ...base,
    type: z.literal('entity'),
    entityId: z.union([z.literal(''), entityIdSchema]),
  }),
  z.object({
    ...base,
    type: z.literal('weather'),
    location: text(120),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
  }),
  z.object({
    ...base,
    type: z.literal('agenda'),
    events: z
      .array(
        z.object({
          id: base.id,
          title: text(120).min(1),
          start: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
            .refine(validLocalDateTime, 'Enter a valid event date and time.'),
          calendar: text(50),
        }),
      )
      .max(50),
  }),
  z.object({ ...base, type: z.literal('video'), url: httpUrl, fit: z.enum(['contain', 'cover']) }),
  z.object({ ...base, type: z.literal('note'), body: text(1000) }),
  z.object({
    ...base,
    type: z.literal('countdown'),
    target: z.string().datetime({ offset: true }).nullable(),
    caption: text(120),
  }),
  z.object({
    ...base,
    type: z.literal('clock'),
    timeZone: z.string().max(100).refine(validTimeZone, 'Choose a valid time zone.'),
  }),
]);

export function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const dashboardSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: text(80).min(1),
    subtitle: text(120),
    timeZone: z.string().max(100).refine(validTimeZone, 'Choose a valid time zone.'),
    units: z.enum(['celsius', 'fahrenheit']),
    hour24: z.boolean(),
    theme: z.enum(themeIds).default(defaultTheme),
    hideCursor: z.boolean().default(false),
    allowDisplayInteractions: z.boolean().default(false),
    widgets: z.array(widgetSchema).min(1).max(20),
  })
  .superRefine((board, context) => {
    if (new Set(board.widgets.map((widget) => widget.id)).size !== board.widgets.length) {
      context.addIssue({
        code: 'custom',
        path: ['widgets'],
        message: 'Each widget must have a unique ID.',
      });
    }
    for (const [index, widget] of board.widgets.entries()) {
      if (widget.type === 'weather' && (widget.latitude === null) !== (widget.longitude === null)) {
        context.addIssue({
          code: 'custom',
          path: ['widgets', index],
          message: 'Set both latitude and longitude.',
        });
      }
    }
  });

export type Dashboard = z.infer<typeof dashboardSchema>;
export type Widget = z.infer<typeof widgetSchema>;
export type WidgetType = Widget['type'];
export type WidgetOf<T extends WidgetType> = Extract<Widget, { type: T }>;
export type Document = {
  revision: number;
  publishedVersion: number;
  updatedAt: string;
  draft: Dashboard;
  published: Dashboard;
};

export function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function createWidget<T extends WidgetType>(type: T, id?: string): WidgetOf<T>;
export function createWidget(type: WidgetType, id: string = newId()): Widget {
  const common = { id, width: 4 as const, height: 3 as const };
  switch (type) {
    case 'ha-weather':
      return {
        ...common,
        type,
        title: 'Outside',
        width: 3,
        height: 6,
        entityId: '',
        temperatureEntityId: '',
        humidityEntityId: '',
        aqiEntityId: '',
        sunEntityId: '',
        secondaryEntityId: '',
      };
    case 'ha-agenda':
      return {
        ...common,
        type,
        title: 'The week ahead',
        width: 5,
        height: 6,
        calendars: [],
        view: 'week',
        hideFinished: true,
        hideDeclined: true,
        hideDuplicates: true,
        showMultiDay: false,
      };
    case 'ha-climate':
      return {
        ...common,
        type,
        title: 'Indoor climate',
        temperatures: [
          { entityId: '', label: 'Room 1' },
          { entityId: '', label: 'Room 2' },
        ],
        co2EntityId: '',
      };
    case 'ha-readiness':
      return { ...common, type, title: 'Readiness', width: 4, height: 3, entityId: '' };
    case 'ha-status':
      return { ...common, type, title: 'Home status', contacts: [], motionEntityId: '' };
    case 'ha-camera':
      return {
        ...common,
        type,
        title: 'Front door',
        entityId: '',
        motionEntityId: '',
        fit: 'contain',
      };
    case 'entity':
      return { ...common, type, title: 'Home Assistant', entityId: '', width: 3, height: 3 };
    case 'weather':
      return {
        ...common,
        type,
        title: 'Weather',
        location: '',
        latitude: null,
        longitude: null,
        width: 3,
        height: 4,
      };
    case 'agenda':
      return { ...common, type, title: 'The week ahead', events: [], width: 5, height: 6 };
    case 'video':
      return { ...common, type, title: 'Live stream', url: '', fit: 'contain' };
    case 'note':
      return {
        ...common,
        type,
        title: 'A little reminder',
        body: 'Make room for what matters.',
        width: 3,
        height: 2,
      };
    case 'countdown':
      return { ...common, type, title: 'Something to look forward to', caption: '', target: null };
    case 'clock':
      return { ...common, type, title: 'World clock', timeZone: 'UTC', width: 3, height: 2 };
  }
}

export function createHomeWidgets(): Widget[] {
  return [
    createWidget('ha-weather'),
    createWidget('ha-agenda'),
    { ...createWidget('ha-camera'), height: 2, fit: 'cover' },
    { ...createWidget('ha-climate'), height: 2 },
    { ...createWidget('ha-readiness'), height: 2 },
  ];
}

export function createDashboard(): Dashboard {
  return {
    schemaVersion: 1,
    title: 'A little more in view.',
    subtitle: 'Your day, at a glance.',
    timeZone: 'UTC',
    units: 'celsius',
    hour24: false,
    theme: defaultTheme,
    hideCursor: false,
    allowDisplayInteractions: false,
    widgets: ['weather', 'agenda', 'video', 'countdown', 'note'].map((type, index) =>
      createWidget(type as WidgetType, `widget-${index + 1}`),
    ),
  };
}

export function createDemoDashboard(now = new Date()): Dashboard {
  const board = createDashboard();
  board.title = 'Home, in the here & now.';
  board.subtitle = 'A little space for everything that matters.';
  board.units = 'fahrenheit';
  const day = (offset: number) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + offset);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  };
  board.widgets = [
    { ...createWidget('weather', 'demo-weather'), title: 'Outside', location: 'Coastside' },
    {
      ...createWidget('agenda', 'demo-agenda'),
      events: [
        {
          id: 'a',
          title: 'Coffee & a slower morning',
          start: `${day(0)}T09:30`,
          calendar: 'Personal',
        },
        { id: 'b', title: 'Designing what comes next', start: `${day(0)}T14:00`, calendar: 'Work' },
        {
          id: 'c',
          title: 'Dinner with the usual suspects',
          start: `${day(0)}T19:00`,
          calendar: 'Together',
        },
        {
          id: 'd',
          title: 'A walk, with no particular plan',
          start: `${day(1)}T08:00`,
          calendar: 'Personal',
        },
        {
          id: 'e',
          title: 'The neighborhood farmers market',
          start: `${day(2)}T10:00`,
          calendar: 'Together',
        },
      ],
    },
    { ...createWidget('video', 'demo-video'), title: 'Somewhere by the sea' },
    {
      ...createWidget('countdown', 'demo-countdown'),
      title: 'The next adventure',
      caption: 'A few days off the beaten path',
      target: new Date(now.getTime() + 12 * 86_400_000 + 7 * 3_600_000).toISOString(),
    },
    {
      ...createWidget('note', 'demo-note'),
      title: 'A thought for today',
      body: 'Less scrolling.\nMore looking up.',
    },
  ];
  return board;
}

/** Match CSS grid's dense placement, keeping widget order independent of screen dimensions. */
export function layoutWidgets(widgets: Widget[]) {
  const occupied: boolean[][] = [];
  return widgets.map((widget) => {
    for (let row = 0; ; row++) {
      for (let column = 0; column <= 12 - widget.width; column++) {
        let available = true;
        for (let y = row; y < row + widget.height; y++) {
          for (let x = column; x < column + widget.width; x++) {
            if (occupied[y]?.[x]) available = false;
          }
        }
        if (!available) continue;
        for (let y = row; y < row + widget.height; y++) {
          occupied[y] ??= Array<boolean>(12).fill(false);
          for (let x = column; x < column + widget.width; x++) occupied[y][x] = true;
        }
        return {
          id: widget.id,
          column: column + 1,
          row: row + 1,
          width: widget.width,
          height: widget.height,
        };
      }
    }
  });
}
