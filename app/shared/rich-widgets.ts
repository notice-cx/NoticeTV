import { z } from 'zod';
import { entityIdSchema, type ConnectionPhase } from './home-assistant.js';
import type { Widget } from './dashboard.js';

const selection = z.union([z.literal(''), entityIdSchema]);
const domain = (name: string) =>
  selection.refine((id) => !id || id.startsWith(`${name}.`), `Choose a ${name} entity.`);
export const weatherLocationSchema = z.object({
  location: z.string().trim().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type WeatherLocation = z.infer<typeof weatherLocationSchema>;
export const homeWeatherSchema = z.object({
  type: z.literal('ha-weather'),
  entityId: domain('weather'),
  temperatureEntityId: selection,
  humidityEntityId: selection,
  aqiEntityId: selection,
  sunEntityId: domain('sun'),
  secondaryEntityId: domain('weather'),
  secondarySource: z.enum(['location', 'home-assistant', 'off']).optional(),
  secondaryLocation: weatherLocationSchema.nullable().default(null),
});
export function secondaryWeatherSource(widget: z.infer<typeof homeWeatherSchema>) {
  return widget.secondarySource || (widget.secondaryEntityId ? 'home-assistant' : 'location');
}
export const calendarSourceSchema = z.object({
  entityId: entityIdSchema.refine((id) => id.startsWith('calendar.'), 'Choose a calendar entity.'),
  name: z.string().trim().max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  reminders: z.boolean(),
  excludeKeywords: z.string().trim().max(500),
});
export const connectedAgendaSchema = z.object({
  type: z.literal('ha-agenda'),
  calendars: z
    .array(calendarSourceSchema)
    .max(8)
    .refine(
      (sources) => new Set(sources.map((source) => source.entityId)).size === sources.length,
      'Choose each calendar once.',
    ),
  view: z.enum(['week', 'month']),
  hideFinished: z.boolean(),
  hideDeclined: z.boolean(),
  hideDuplicates: z.boolean(),
  showMultiDay: z.boolean(),
});
export const climateSourceSchema = z.object({
  entityId: selection,
  label: z.string().trim().max(60),
});
export const indoorClimateSchema = z.object({
  type: z.literal('ha-climate'),
  temperatures: z
    .array(climateSourceSchema)
    .min(1)
    .max(2)
    .refine((sources) => {
      const ids = sources.map((source) => source.entityId).filter(Boolean);
      return new Set(ids).size === ids.length;
    }, 'Choose each temperature entity once.'),
  co2EntityId: selection,
});
export const readinessSchema = z.object({ type: z.literal('ha-readiness'), entityId: selection });
export const homeStatusSchema = z.object({
  type: z.literal('ha-status'),
  contacts: z
    .array(
      entityIdSchema.refine((id) => id.startsWith('binary_sensor.'), 'Choose a contact sensor.'),
    )
    .max(12)
    .refine((ids) => new Set(ids).size === ids.length, 'Choose each contact sensor once.'),
  motionEntityId: domain('binary_sensor'),
});
export const cameraSchema = z.object({
  type: z.literal('ha-camera'),
  entityId: domain('camera'),
  motionEntityId: domain('binary_sensor'),
  fit: z.enum(['contain', 'cover']),
});
export const richWidgetTypes = [
  'ha-weather',
  'ha-agenda',
  'ha-climate',
  'ha-readiness',
  'ha-status',
  'ha-camera',
] as const;
export type RichWidgetType = (typeof richWidgetTypes)[number];
export type RichWidget = Extract<Widget, { type: RichWidgetType }>;
export const isRichWidget = (widget: Widget): widget is RichWidget =>
  (richWidgetTypes as readonly string[]).includes(widget.type);
export function widgetEntityIds(widget: Widget): string[] {
  let ids: string[] = [];
  switch (widget.type) {
    case 'weather':
      ids = [widget.temperatureEntityId];
      break;
    case 'entity':
    case 'ha-readiness':
      ids = [widget.entityId];
      break;
    case 'ha-weather':
      ids = [
        widget.entityId,
        widget.temperatureEntityId,
        widget.humidityEntityId,
        widget.aqiEntityId,
        widget.sunEntityId,
        secondaryWeatherSource(widget) === 'home-assistant' ? widget.secondaryEntityId : '',
      ];
      break;
    case 'ha-agenda':
      ids = widget.calendars.map((source) => source.entityId);
      break;
    case 'ha-climate':
      ids = [...widget.temperatures.map((source) => source.entityId), widget.co2EntityId];
      break;
    case 'ha-status':
      ids = [...widget.contacts, widget.motionEntityId];
      break;
    case 'ha-camera':
      ids = [widget.entityId, widget.motionEntityId];
      break;
  }
  return [...new Set(ids.filter(Boolean))];
}

export type Reading = {
  name: string;
  value: number | null;
  unit: string | null;
  updatedAt: string | null;
};
export type HistoryPoint = { time: number; value: number | null };
export type HistorySeries = Reading & { id: string; points: HistoryPoint[] };
export type ForecastDay = {
  date: string;
  condition: string;
  high: number | null;
  low: number | null;
};
export type WeatherPlace = {
  name: string;
  condition: string;
  temperature: number | null;
  humidity: number | null;
  unit: string | null;
  forecast: ForecastDay[];
  attribution: string | null;
};
export type WeatherData = {
  current: WeatherPlace | null;
  secondary: WeatherPlace | null;
  aqi: number | null;
  sunset: string | null;
  sunrise: string | null;
  moon: { phase: number; fraction: number; name: string };
};
export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendar: string;
  entityId: string;
  color: string;
  description: string;
  location: string;
};
export type AgendaData = {
  events: CalendarEvent[];
  nextMeeting: CalendarEvent | null;
  rangeStart: string;
  rangeEnd: string;
};
export type Contact = { id: string; name: string; state: 'open' | 'closed' | 'unavailable' };
export type StatusData = { contacts: Contact[]; motion: 'active' | 'clear' | 'unavailable' | null };
type Payloads = {
  'ha-weather': WeatherData;
  'ha-agenda': AgendaData;
  'ha-climate': {
    temperatures: HistorySeries[];
    co2: HistorySeries | null;
    start: number;
    end: number;
  };
  'ha-readiness': {
    score: Reading;
    points: HistoryPoint[];
    average: number | null;
    start: number;
    end: number;
  };
  'ha-status': StatusData;
  'ha-camera': { name: string; available: boolean; motion: StatusData['motion'] };
};
export type RichWidgetData = {
  [K in RichWidgetType]: {
    type: K;
    phase: ConnectionPhase;
    stale: boolean;
    updatedAt: string | null;
    warnings: string[];
    data: Payloads[K];
  };
}[RichWidgetType];
