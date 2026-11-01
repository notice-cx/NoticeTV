import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Moon,
  Sun,
  Sunrise,
  Sunset,
  Wind,
} from 'lucide-react';
import type { Dashboard } from '../../shared/dashboard';
import type { RichWidgetData, WeatherPlace } from '../../shared/rich-widgets';
import { dateKey } from '../../shared/ha-data';
import { number } from './ui';

const conditionName = (value: string) =>
  ({
    partlycloudy: 'Partly cloudy',
    'clear-night': 'Clear night',
    'lightning-rainy': 'Thunderstorms',
    'snowy-rainy': 'Wintry mix',
    'windy-variant': 'Windy',
  })[value] || value.replaceAll('-', ' ').replace(/^./, (letter) => letter.toUpperCase());
function WeatherSymbol({ condition, size = 22 }: { condition: string; size?: number }) {
  const Icon =
    condition === 'sunny'
      ? Sun
      : condition === 'clear-night'
        ? Moon
        : condition.includes('lightning')
          ? CloudLightning
          : condition.includes('snow')
            ? CloudSnow
            : ['rainy', 'pouring', 'hail'].includes(condition)
              ? CloudRain
              : condition === 'fog'
                ? CloudFog
                : condition.includes('wind')
                  ? Wind
                  : condition === 'partlycloudy'
                    ? CloudSun
                    : Cloud;
  return <Icon size={size} strokeWidth={1.2} aria-hidden="true" />;
}
function MoonDisc({ phase, size = 18 }: { phase: number; size?: number }) {
  const p = ((phase % 1) + 1) % 1;
  const radius = Math.abs(Math.cos(2 * Math.PI * p)) * 9;
  const path = `M12 3 A9 9 0 0 ${p <= 0.5 ? 1 : 0} 12 21 A${radius.toFixed(3)} 9 0 0 ${p < 0.25 ? 0 : p <= 0.5 ? 1 : p < 0.75 ? 0 : 1} 12 3Z`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="var(--line-strong)" />
      {p > 0.001 &&
        p < 0.999 &&
        (Math.abs(p - 0.5) < 0.001 ? (
          <circle cx="12" cy="12" r="9" fill="currentColor" />
        ) : (
          <path d={path} fill="currentColor" />
        ))}
    </svg>
  );
}

export function HomeWeather({
  value,
  board,
  now,
}: {
  value: Extract<RichWidgetData, { type: 'ha-weather' }>['data'];
  board: Dashboard;
  now: Date;
}) {
  const weather = value.current;
  const formatTime = (date: string | null) =>
    date
      ? new Intl.DateTimeFormat('en', {
          timeZone: board.timeZone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: !board.hour24,
        }).format(new Date(date))
      : '—';
  const dayName = (day: string) =>
    new Intl.DateTimeFormat('en', { timeZone: 'UTC', weekday: 'short' }).format(
      new Date(`${day}T12:00:00Z`),
    );
  const today = dateKey(now, board.timeZone);
  const values =
    weather?.forecast
      .flatMap((day) => [day.low, day.high])
      .filter((v): v is number => v !== null) || [];
  const low = Math.min(...values),
    high = Math.max(...values);
  return (
    <div className="home-weather-content" tabIndex={0} role="region" aria-label="Weather details">
      <div className="home-weather-current">
        <div>
          <div className="home-weather-temperature">
            {number(weather?.temperature ?? null)}
            <sup>{weather?.unit || ''}</sup>
          </div>
          <p>{weather ? conditionName(weather.condition) : 'Weather unavailable'}</p>
        </div>
        <WeatherSymbol condition={weather?.condition || ''} size={64} />
      </div>
      <div className="home-weather-meta">
        <span>
          <Droplets size={13} />
          {number(weather?.humidity ?? null)}% humidity
        </span>
        <span>US AQI {number(value.aqi)}</span>
      </div>
      <div className="home-forecast" aria-label="Seven-day forecast">
        {weather?.forecast.length ? (
          weather.forecast.map((day) => (
            <div key={day.date} className="home-forecast-row">
              <span>{day.date === today ? 'Today' : dayName(day.date)}</span>
              <WeatherSymbol condition={day.condition} size={17} />
              <span className="forecast-low">{number(day.low)}°</span>
              <div className="forecast-track">
                <i
                  style={{
                    left: `${day.low === null ? 0 : (100 * (day.low - low)) / (high - low || 1)}%`,
                    width: `${day.low === null || day.high === null ? 0 : Math.max(5, (100 * (day.high - day.low)) / (high - low || 1))}%`,
                  }}
                />
              </div>
              <span>{number(day.high)}°</span>
            </div>
          ))
        ) : (
          <p className="rich-unavailable">Forecast unavailable</p>
        )}
      </div>
      {value.secondary && <CityStrip weather={value.secondary} today={today} dayName={dayName} />}
      <div className="home-sun-times">
        <div>
          <Sunset size={18} />
          <span>
            Today’s sunset<strong>{formatTime(value.sunset)}</strong>
          </span>
        </div>
        <div>
          <Sunrise size={18} />
          <span>
            Tomorrow’s sunrise<strong>{formatTime(value.sunrise)}</strong>
          </span>
        </div>
      </div>
      <div className="home-moon">
        <div>
          <span>{value.moon.name}</span>
          <span>{number(value.moon.fraction * 100)}% illuminated</span>
        </div>
        <div className="moon-phases">
          {Array.from({ length: 8 }, (_, index) => (
            <span
              key={index}
              className={Math.round(value.moon.phase * 8) % 8 === index ? 'current' : ''}
            >
              <MoonDisc phase={index / 8} size={23} />
            </span>
          ))}
        </div>
      </div>
      {weather?.attribution && <p className="rich-attribution">{weather.attribution}</p>}
    </div>
  );
}
function CityStrip({
  weather,
  today,
  dayName,
}: {
  weather: WeatherPlace;
  today: string;
  dayName: (day: string) => string;
}) {
  return (
    <section className="home-city-strip" aria-label={`${weather.name} weather`}>
      <div className="home-city-label">
        {weather.name}
        <small>{weather.unit}</small>
      </div>
      <div className="home-city-days">
        <div>
          <span>Now</span>
          <WeatherSymbol condition={weather.condition} size={19} />
          <strong>{number(weather.temperature)}°</strong>
        </div>
        {weather.forecast
          .filter((day) => day.date > today)
          .slice(0, 5)
          .map((day) => (
            <div key={day.date}>
              <span>{dayName(day.date)}</span>
              <WeatherSymbol condition={day.condition} size={17} />
              <strong>
                {number(day.high)}° <small>{number(day.low)}°</small>
              </strong>
            </div>
          ))}
      </div>
      {weather.attribution && <p className="rich-attribution">{weather.attribution}</p>}
    </section>
  );
}
