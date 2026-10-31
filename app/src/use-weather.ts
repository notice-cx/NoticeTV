import { useEffect, useState } from 'react';
import { z } from 'zod';
import type { WidgetOf } from '../shared/dashboard';

const responseSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    relative_humidity_2m: z.number(),
    weather_code: z.number(),
    wind_speed_10m: z.number(),
    is_day: z.number(),
  }),
  daily: z
    .object({
      time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
      weather_code: z.array(z.number()),
      temperature_2m_max: z.array(z.number()),
      temperature_2m_min: z.array(z.number()),
    })
    .refine((daily) =>
      [daily.weather_code, daily.temperature_2m_max, daily.temperature_2m_min].every(
        (values) => values.length === daily.time.length,
      ),
    ),
});
export type Weather = z.infer<typeof responseSchema>;
const sample: Weather = {
  current: {
    temperature_2m: 64,
    relative_humidity_2m: 68,
    weather_code: 2,
    wind_speed_10m: 8,
    is_day: 1,
  },
  daily: {
    time: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'],
    weather_code: [2, 0, 3, 61, 2],
    temperature_2m_max: [66, 68, 65, 61, 64],
    temperature_2m_min: [54, 53, 52, 51, 52],
  },
};

export function useWeather(
  widget: WidgetOf<'weather'>,
  units: 'celsius' | 'fahrenheit',
  timeZone: string,
  demo: boolean,
) {
  const [state, setState] = useState<{
    data: Weather | null;
    loading: boolean;
    error: boolean;
    updated: number | null;
  }>({ data: null, loading: false, error: false, updated: null });
  const { latitude, longitude } = widget;
  useEffect(() => {
    if (demo || latitude === null || longitude === null) {
      setState({ data: null, loading: false, error: false, updated: null });
      return;
    }
    const controller = new AbortController();
    let running = false;
    async function refresh() {
      if (running || document.hidden) return;
      running = true;
      setState((old) => ({ ...old, loading: true }));
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min',
        temperature_unit: units,
        wind_speed_unit: units === 'fahrenheit' ? 'mph' : 'kmh',
        timezone: timeZone,
        forecast_days: '5',
      });
      try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
        if (!response.ok) throw new Error('Weather unavailable');
        const data = responseSchema.parse(await response.json());
        if (!controller.signal.aborted)
          setState({ data, loading: false, error: false, updated: Date.now() });
      } catch {
        if (!controller.signal.aborted)
          setState((old) => ({ ...old, loading: false, error: true }));
      } finally {
        running = false;
      }
    }
    setState({ data: null, loading: true, error: false, updated: null });
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 15 * 60_000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener('online', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      controller.abort();
      clearInterval(interval);
      window.removeEventListener('online', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [latitude, longitude, units, timeZone, demo]);
  if (!demo) return state;
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (name: string) => Number(local.find((value) => value.type === name)?.value);
  const dates = Array.from({ length: 5 }, (_, offset) =>
    new Date(Date.UTC(part('year'), part('month') - 1, part('day') + offset))
      .toISOString()
      .slice(0, 10),
  );
  const temperatures =
    units === 'fahrenheit'
      ? sample
      : {
          ...sample,
          current: { ...sample.current, temperature_2m: 18 },
          daily: {
            ...sample.daily,
            temperature_2m_max: [19, 20, 18, 16, 18],
            temperature_2m_min: [12, 12, 11, 11, 11],
          },
        };
  return {
    data: { ...temperatures, daily: { ...temperatures.daily, time: dates } },
    loading: false,
    error: false,
    updated: null,
  };
}
