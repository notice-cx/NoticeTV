import SunCalc from 'suncalc';
import {
  asRecord,
  calendarMidnight,
  calendarRange,
  dailyForecast,
  dateKey,
  liveSeries,
  nextMeeting,
  normalizeEvents,
  numeric,
  offsetDay,
  recordedSeries,
  text,
  temperatureValue,
} from '../shared/ha-data.js';
import {
  widgetEntityIds,
  type HistorySeries,
  type Reading,
  type RichWidget,
  type RichWidgetData,
  type WeatherPlace,
} from '../shared/rich-widgets.js';
import { HomeAssistantConnection, HomeAssistantError } from './home-assistant.js';

type Saved<T> = { value: T; updatedAt: number; stale: boolean };
type Entry = {
  value?: unknown;
  updatedAt: number;
  attemptedAt: number;
  failed: boolean;
  pending?: Promise<Saved<unknown>>;
};
const phases = [
  'New moon',
  'Waxing crescent',
  'First quarter',
  'Waxing gibbous',
  'Full moon',
  'Waning gibbous',
  'Last quarter',
  'Waning crescent',
];
export function sunSchedule(
  now: Date,
  timeZone: string,
  configuration: unknown,
  attributes: Record<string, unknown> = {},
) {
  const config = asRecord(configuration),
    latitude = numeric(config.latitude),
    longitude = numeric(config.longitude);
  const today = dateKey(now, timeZone),
    tomorrow = offsetDay(today, 1);
  function event(day: string, attribute: string, name: 'sunset' | 'sunrise'): string | null {
    const supplied = new Date(text(attributes[attribute]));
    if (Number.isFinite(supplied.getTime()) && dateKey(supplied, timeZone) === day)
      return supplied.toISOString();
    if (
      latitude === null ||
      longitude === null ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      return null;
    const noon = new Date(calendarMidnight(day, timeZone).getTime() + 12 * 3600_000);
    const calculated = SunCalc.getTimes(noon, latitude, longitude)[name];
    return Number.isFinite(calculated.getTime()) && dateKey(calculated, timeZone) === day
      ? calculated.toISOString()
      : null;
  }
  const moon = SunCalc.getMoonIllumination(now);
  return {
    sunset: event(today, 'next_setting', 'sunset'),
    sunrise: event(tomorrow, 'next_rising', 'sunrise'),
    moon: {
      phase: moon.phase,
      fraction: moon.fraction,
      name: phases[Math.round(moon.phase * 8) % 8],
    },
  };
}

export class HAWidgets {
  private cache = new Map<string, Entry>();
  private generation = -1;
  constructor(
    private ha: HomeAssistantConnection,
    private clock: () => Date = () => new Date(),
  ) {}

  private async remember<T>(key: string, ttl: number, load: () => Promise<T>): Promise<Saved<T>> {
    if (this.generation !== this.ha.generation) {
      this.cache.clear();
      this.generation = this.ha.generation;
    }
    const now = this.clock().getTime();
    const entry = this.cache.get(key) || { updatedAt: 0, attemptedAt: 0, failed: false };
    this.cache.delete(key);
    this.cache.set(key, entry);
    if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!);
    if (entry.pending) return entry.pending as Promise<Saved<T>>;
    if (entry.value !== undefined && now - entry.updatedAt < ttl && !entry.failed)
      return { value: entry.value as T, updatedAt: entry.updatedAt, stale: false };
    if (entry.failed && now - entry.attemptedAt < 30_000) {
      if (entry.value !== undefined)
        return { value: entry.value as T, updatedAt: entry.updatedAt, stale: true };
      throw new HomeAssistantError('Home Assistant data is temporarily unavailable.');
    }
    entry.attemptedAt = now;
    const pending = load()
      .then((value) => {
        entry.value = value;
        entry.updatedAt = this.clock().getTime();
        entry.failed = false;
        return { value, updatedAt: entry.updatedAt, stale: false };
      })
      .catch(() => {
        entry.failed = true;
        if (entry.value !== undefined)
          return { value: entry.value as T, updatedAt: entry.updatedAt, stale: true };
        throw new HomeAssistantError('Home Assistant data is temporarily unavailable.');
      })
      .finally(() => {
        entry.pending = undefined;
      });
    entry.pending = pending;
    return pending;
  }

  async data(
    widget: RichWidget,
    timeZone: string,
    units: 'celsius' | 'fahrenheit',
  ): Promise<RichWidgetData> {
    const generation = this.ha.generation;
    const result = await this.buildData(widget, timeZone, units);
    if (generation !== this.ha.generation)
      throw new HomeAssistantError('The Home Assistant connection changed. Retrying.');
    return result;
  }

  private async buildData(
    widget: RichWidget,
    timeZone: string,
    units: 'celsius' | 'fahrenheit',
  ): Promise<RichWidgetData> {
    const now = this.clock(),
      status = this.ha.status();
    const base = {
      phase: status.phase,
      stale: status.phase !== 'connected',
      updatedAt: status.receivedAt,
      warnings: [] as string[],
    };
    const warnings = base.warnings;
    const absorb = <T>(saved: Saved<T>, name: string) => {
      if (saved.stale) {
        base.stale = true;
        warnings.push(`${name} · last update ${new Date(saved.updatedAt).toISOString()}`);
      }
      return saved.value;
    };
    const config = async () =>
      absorb(
        await this.remember('config', 3600_000, () => this.ha.configuration()),
        'Home settings',
      );
    const reading = (
      id: string,
      attribute = 'state',
      fallbackUnit: string | null = null,
    ): Reading => {
      const state = this.ha.state(id);
      return {
        name: text(state?.attributes.friendly_name, 100) || id,
        value:
          !state || ['unknown', 'unavailable'].includes(state.state)
            ? null
            : numeric(attribute === 'state' ? state.state : state.attributes[attribute]),
        unit:
          text(state?.attributes.unit_of_measurement || state?.attributes.temperature_unit, 20) ||
          fallbackUnit,
        updatedAt: state?.last_updated || null,
      };
    };
    const targetUnit = units === 'celsius' ? '°C' : '°F';
    const convert = (value: number | null, unit: string | null) =>
      temperatureValue(value, unit, units);
    const converted = (value: Reading): Reading => ({
      ...value,
      value: convert(value.value, value.unit),
      unit: ['°C', '°F', 'K', '°K'].includes(value.unit || '') ? targetUnit : null,
    });
    if (widget.type === 'ha-weather') {
      const configurationPromise = config().catch(() => ({}));
      const place = async (id: string, primary: boolean): Promise<WeatherPlace | null> => {
        if (!id) return null;
        const state = this.ha.state(id);
        if (!state || ['unknown', 'unavailable'].includes(state.state)) {
          warnings.push('Weather entity unavailable');
          return null;
        }
        const [configuration, forecast] = await Promise.all([
          configurationPromise,
          this.remember(`forecast:${id}`, 15 * 60_000, () => this.ha.forecast(id))
            .then((saved) => absorb(saved, 'Forecast'))
            .catch(() => {
              base.stale = true;
              warnings.push('Forecast unavailable · retrying');
              return [] as unknown[];
            }),
        ]);
        const defaultUnit =
          text(asRecord(asRecord(configuration).unit_system).temperature, 20) || null;
        const unit = text(state.attributes.temperature_unit, 20) || defaultUnit;
        const outdoor = primary ? reading(widget.temperatureEntityId) : null;
        const humidity = primary ? reading(widget.humidityEntityId).value : null;
        return {
          name: text(state.attributes.friendly_name, 100) || id,
          condition: state.state,
          temperature:
            outdoor?.value !== null && outdoor?.value !== undefined
              ? convert(outdoor.value, outdoor.unit || unit)
              : convert(numeric(state.attributes.temperature), unit),
          humidity: humidity ?? numeric(state.attributes.humidity),
          unit: ['°C', '°F', 'K', '°K'].includes(unit || '') ? targetUnit : null,
          forecast: dailyForecast(forecast, timeZone, now).map((day) => ({
            ...day,
            high: convert(day.high, unit),
            low: convert(day.low, unit),
          })),
          attribution: text(state.attributes.attribution, 300) || null,
        };
      };
      const [current, secondary, configuration] = await Promise.all([
        place(widget.entityId, true),
        place(widget.secondaryEntityId, false),
        configurationPromise,
      ]);
      const sun = this.ha.state(widget.sunEntityId)?.attributes;
      return {
        ...base,
        type: widget.type,
        data: {
          current,
          secondary,
          aqi: reading(widget.aqiEntityId).value,
          ...sunSchedule(now, timeZone, configuration, sun),
        },
      };
    }
    if (widget.type === 'ha-agenda') {
      const range = calendarRange(now, timeZone);
      const results = await Promise.all(
        widget.calendars.map(async (source) => {
          try {
            return absorb(
              await this.remember(
                `calendar:${source.entityId}:${range.start}:${range.end}`,
                5 * 60_000,
                () => this.ha.calendar(source.entityId, range.start, range.end),
              ),
              source.name || 'Calendar',
            );
          } catch {
            base.stale = true;
            warnings.push(`${source.name || source.entityId} unavailable`);
            return [];
          }
        }),
      );
      const events = normalizeEvents(results, widget, now, timeZone);
      return {
        ...base,
        type: widget.type,
        data: {
          events,
          nextMeeting: nextMeeting(events, widget.calendars, now),
          rangeStart: range.start,
          rangeEnd: range.end,
        },
      };
    }
    if (widget.type === 'ha-climate' || widget.type === 'ha-readiness') {
      const end = now.getTime(),
        start = end - (widget.type === 'ha-readiness' ? 7 : 1) * 86_400_000;
      const ids = widgetEntityIds(widget);
      const configurationPromise =
        widget.type === 'ha-climate' ? config().catch(() => ({})) : Promise.resolve({});
      let history: unknown = [];
      if (ids.length) {
        try {
          history = absorb(
            await this.remember(`history:${widget.type}:${ids.join(',')}`, 5 * 60_000, () =>
              this.ha.history(ids, new Date(start).toISOString(), now.toISOString()),
            ),
            'History',
          );
        } catch {
          base.stale = true;
          warnings.push('History unavailable · retrying');
        }
      }
      if (widget.type === 'ha-readiness') {
        const score = reading(widget.entityId);
        if (score.value !== null && (score.value < 0 || score.value > 100)) score.value = null;
        const recorded = recordedSeries(history, widget.entityId).map((point) => ({
          ...point,
          value:
            point.value !== null && point.value >= 0 && point.value <= 100 ? point.value : null,
        }));
        const values = recorded
          .filter((point) => point.time >= start && point.value !== null)
          .map((point) => point.value!);
        return {
          ...base,
          type: widget.type,
          data: {
            score,
            points: liveSeries(recorded, score.value, start, end),
            average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
            start,
            end,
          },
        };
      }
      const configuration = await configurationPromise;
      const defaultUnit =
        text(asRecord(asRecord(configuration).unit_system).temperature, 20) || null;
      const temperatures: HistorySeries[] = widget.temperatures
        .filter((source) => source.entityId)
        .map((source) => {
          const attribute = source.entityId.startsWith('climate.')
            ? 'current_temperature'
            : 'state';
          const original = reading(source.entityId, attribute, defaultUnit),
            current = converted(original);
          const points = recordedSeries(history, source.entityId, attribute, (value, attributes) =>
            convert(
              value,
              text(attributes.unit_of_measurement || attributes.temperature_unit, 20) ||
                original.unit,
            ),
          );
          return {
            ...current,
            id: source.entityId,
            name: source.label || current.name,
            points: liveSeries(points, current.value, start, end),
          };
        });
      const co2Reading = reading(widget.co2EntityId);
      const co2 = widget.co2EntityId
        ? {
            ...co2Reading,
            id: widget.co2EntityId,
            points: liveSeries(
              recordedSeries(history, widget.co2EntityId),
              co2Reading.value,
              start,
              end,
            ),
          }
        : null;
      return { ...base, type: widget.type, data: { temperatures, co2, start, end } };
    }
    const motion = (id: string) =>
      !id
        ? null
        : this.ha.state(id)?.state === 'on'
          ? ('active' as const)
          : this.ha.state(id)?.state === 'off'
            ? ('clear' as const)
            : ('unavailable' as const);
    if (widget.type === 'ha-status') {
      return {
        ...base,
        type: widget.type,
        data: {
          contacts: widget.contacts.map((id) => ({
            id,
            name: text(this.ha.state(id)?.attributes.friendly_name, 100) || id,
            state:
              this.ha.state(id)?.state === 'on'
                ? 'open'
                : this.ha.state(id)?.state === 'off'
                  ? 'closed'
                  : 'unavailable',
          })),
          motion: motion(widget.motionEntityId),
        },
      };
    }
    const camera = this.ha.state(widget.entityId);
    return {
      ...base,
      type: widget.type,
      data: {
        name: text(camera?.attributes.friendly_name, 100) || widget.title,
        available: !!camera && !['unavailable', 'unknown'].includes(camera.state),
        motion: motion(widget.motionEntityId),
      },
    };
  }

  async snapshot(entityId: string) {
    const generation = this.ha.generation;
    const saved = await this.remember(`camera:${entityId}`, 20_000, () =>
      this.ha.snapshot(entityId),
    );
    if (generation !== this.ha.generation)
      throw new HomeAssistantError('The Home Assistant connection changed. Retrying.');
    return {
      ...saved.value,
      capturedAt: new Date(saved.updatedAt).toISOString(),
      stale: saved.stale,
    };
  }
}
