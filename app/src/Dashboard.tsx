import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Cloud,
  CloudDrizzle,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  MapPin,
  Moon,
  Sun,
  Wind,
} from 'lucide-react';
import {
  layoutWidgets,
  type Dashboard as DashboardData,
  type Widget,
  type WidgetOf,
} from '../shared/dashboard';
import { useWeather } from './use-weather';
import { Video } from './Video';

export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

export function Dashboard({
  dashboard,
  demo = false,
  passive = false,
  selected,
  onSelect,
  online = true,
}: {
  dashboard: DashboardData;
  demo?: boolean;
  passive?: boolean;
  selected?: string | null;
  onSelect?: (id: string) => void;
  online?: boolean;
}) {
  const now = useNow();
  const placements = layoutWidgets(dashboard.widgets);
  const rows = Math.max(6, ...placements.map((placement) => placement.row + placement.height - 1));
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en', { timeZone: dashboard.timeZone, ...options }).format(now);
  const clock = format({ hour: 'numeric', minute: '2-digit', hour12: !dashboard.hour24 });
  const parts = clock.match(/^(.*?)(?:\s*(AM|PM))?$/i);
  return (
    <div className={`dashboard ${passive ? 'is-passive' : ''} ${onSelect ? 'is-editable' : ''}`}>
      <header className="dashboard-header">
        <div className="dashboard-intro">
          <div className="board-eyebrow">
            <span className="sun-mark">✳</span> A LITTLE MORE IN VIEW
          </div>
          <h1>{dashboard.title}</h1>
          <p>{dashboard.subtitle}</p>
        </div>
        <div className="dashboard-date">
          <span>
            {format({ weekday: 'long' })}
            <span className="date-separator"> / </span>
            {format({ month: 'long', day: 'numeric' })}
          </span>
          <div className="board-clock">
            {parts?.[1]}
            <small>{parts?.[2]}</small>
          </div>
        </div>
      </header>
      <div className="widget-grid" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {dashboard.widgets.map((widget, index) => {
          const placement = placements[index];
          return (
            <section
              key={widget.id}
              className={`widget widget-${widget.type} ${selected === widget.id ? 'is-selected' : ''}`}
              style={{
                gridColumn: `${placement.column} / span ${placement.width}`,
                gridRow: `${placement.row} / span ${placement.height}`,
              }}
              aria-label={widget.title}
            >
              <WidgetContent
                widget={widget}
                dashboard={dashboard}
                now={now}
                demo={demo}
                passive={passive}
              />
              {onSelect && (
                <button
                  className="widget-select"
                  onClick={() => onSelect(widget.id)}
                  aria-label={`Edit ${widget.title}`}
                  aria-pressed={selected === widget.id}
                >
                  <span>
                    Edit widget <ArrowUpRight size={12} />
                  </span>
                </button>
              )}
            </section>
          );
        })}
      </div>
      <footer className="dashboard-footer">
        <span className="board-wordmark">
          Notice<span>TV</span>
          <i />
        </span>
        <span>
          {demo
            ? 'Fictional data · Make it your own'
            : dashboard.timeZone.replaceAll('_', ' ').replaceAll('/', ' / ')}
        </span>
        <span className="board-status">
          <i className={`status-dot ${online ? '' : 'amber'}`} />
          {demo ? 'DESIGN PREVIEW' : online ? 'IN THE HERE & NOW' : 'WAITING TO RECONNECT'}
        </span>
      </footer>
    </div>
  );
}

function WidgetContent({
  widget,
  dashboard,
  now,
  demo,
  passive,
}: {
  widget: Widget;
  dashboard: DashboardData;
  now: Date;
  demo: boolean;
  passive: boolean;
}) {
  switch (widget.type) {
    case 'weather':
      return <WeatherWidget widget={widget} dashboard={dashboard} demo={demo} />;
    case 'agenda':
      return <AgendaWidget widget={widget} dashboard={dashboard} now={now} />;
    case 'video':
      return <Video widget={widget} demo={demo} passive={passive} />;
    case 'note':
      return (
        <div className="note-widget">
          <span className="tiny-label">{widget.title}</span>
          <p>{widget.body || 'A little space for a thought.'}</p>
          <span className="note-spark">✳</span>
        </div>
      );
    case 'countdown': {
      const distance = widget.target
        ? Math.max(0, new Date(widget.target).getTime() - now.getTime())
        : null;
      return (
        <div className="countdown-widget">
          <div className="tiny-label">{widget.title}</div>
          <div className="countdown-value">
            {distance === null ? '—' : Math.floor(distance / 86_400_000)}
            <span>days</span>
            <ArrowUpRight size={30} strokeWidth={1} />
          </div>
          <div className="countdown-bottom">
            <span>
              {distance === null
                ? 'Set a date to start looking forward.'
                : distance === 0
                  ? 'Today’s the day.'
                  : widget.caption || 'Something good is on the horizon.'}
            </span>
            <span className="countdown-dashes" aria-hidden="true">
              {Array.from({ length: 23 }, (_, index) => (
                <i key={index} style={{ opacity: index < 13 ? 1 : 0.18 }} />
              ))}
            </span>
          </div>
        </div>
      );
    }
    case 'clock':
      return (
        <div className="world-clock">
          <span className="tiny-label">{widget.title}</span>
          <div>
            {new Intl.DateTimeFormat('en', {
              timeZone: widget.timeZone,
              hour: 'numeric',
              minute: '2-digit',
              hour12: !dashboard.hour24,
            }).format(now)}
          </div>
          <p>{widget.timeZone.replaceAll('_', ' ').replaceAll('/', ' / ')}</p>
        </div>
      );
  }
}

function WeatherIcon({ code, size = 24 }: { code: number; size?: number }) {
  const Icon =
    code === 0
      ? Sun
      : code <= 2
        ? CloudSun
        : code <= 48
          ? Cloud
          : code <= 57
            ? CloudDrizzle
            : code <= 67
              ? CloudRain
              : code <= 77
                ? CloudSnow
                : code <= 86
                  ? CloudRain
                  : CloudLightning;
  return <Icon size={size} strokeWidth={1.2} />;
}
function condition(code: number) {
  return code === 0
    ? 'Clear skies'
    : code <= 2
      ? 'A little sun, a little cloud.'
      : code <= 48
        ? 'Clouds overhead'
        : code <= 67
          ? 'Rain in the air'
          : code <= 77
            ? 'A little snow'
            : code <= 86
              ? 'Passing showers'
              : 'Thunderstorms';
}

function WeatherWidget({
  widget,
  dashboard,
  demo,
}: {
  widget: WidgetOf<'weather'>;
  dashboard: DashboardData;
  demo: boolean;
}) {
  const { data, loading, error, updated } = useWeather(
    widget,
    dashboard.units,
    dashboard.timeZone,
    demo,
  );
  return (
    <div className="weather-widget">
      <div className="widget-heading">
        <span className="tiny-label">{widget.title}</span>
        <span className="weather-location">
          <MapPin size={11} />
          {widget.location || 'Your location'}
        </span>
      </div>
      {!data ? (
        <div className="empty-weather">
          <CloudSun size={53} strokeWidth={1} />
          <h3>
            {loading
              ? 'Looking outside…'
              : error
                ? 'Weather is unavailable.'
                : 'What’s it like out there?'}
          </h3>
          <p>
            {error
              ? 'We’ll try again when the connection returns.'
              : 'Choose a location in widget settings.'}
          </p>
        </div>
      ) : (
        <>
          <div className="weather-main">
            <span className="temperature">
              {Math.round(data.current.temperature_2m)}
              <sup>°</sup>
            </span>
            <span className="weather-main-icon">
              <WeatherIcon code={data.current.weather_code} size={64} />
            </span>
          </div>
          <p className="weather-condition">{condition(data.current.weather_code)}</p>
          <div className="weather-details">
            <span>
              <Droplets size={12} />
              {data.current.relative_humidity_2m}%
            </span>
            <span>
              <Wind size={13} />
              {Math.round(data.current.wind_speed_10m)}{' '}
              {dashboard.units === 'fahrenheit' ? 'mph' : 'km/h'}
            </span>
          </div>
          <div className="forecast">
            {data.daily.time.slice(0, 5).map((date, index) => (
              <div className="forecast-day" key={date}>
                <span>
                  {index === 0
                    ? 'Today'
                    : new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(
                        new Date(`${date}T12:00:00Z`),
                      )}
                </span>
                <WeatherIcon code={data.daily.weather_code[index]} size={17} />
                <span className="forecast-low">
                  {Math.round(data.daily.temperature_2m_min[index])}°
                </span>
                <div className="forecast-track">
                  <i
                    style={{
                      left: `${((data.daily.temperature_2m_min[index] - Math.min(...data.daily.temperature_2m_min)) / Math.max(1, Math.max(...data.daily.temperature_2m_max) - Math.min(...data.daily.temperature_2m_min))) * 100}%`,
                      width: `${Math.max(2, ((data.daily.temperature_2m_max[index] - data.daily.temperature_2m_min[index]) / Math.max(1, Math.max(...data.daily.temperature_2m_max) - Math.min(...data.daily.temperature_2m_min))) * 100)}%`,
                    }}
                  />
                </div>
                <span>{Math.round(data.daily.temperature_2m_max[index])}°</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className={`weather-credit ${error ? 'stale' : ''}`}>
        {demo ? (
          <>
            <Sun size={11} /> A good day to look up.
          </>
        ) : error && updated ? (
          `Last update ${new Date(updated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        ) : (
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Weather by Open-Meteo <ArrowUpRight size={10} />
          </a>
        )}
      </div>
    </div>
  );
}

function AgendaWidget({
  widget,
  dashboard,
  now,
}: {
  widget: WidgetOf<'agenda'>;
  dashboard: DashboardData;
  now: Date;
}) {
  const todayParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: dashboard.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => todayParts.find((value) => value.type === type)?.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const year = Number(part('year'));
  const passed = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.UTC(year, 0, 1)) / 86_400_000);
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
  const events = [...widget.events]
    .filter((event) => event.start.slice(0, 10) >= today)
    .sort((a, b) => a.start.localeCompare(b.start));
  const dates = [...new Set(events.map((event) => event.start.slice(0, 10)))];
  return (
    <div className="agenda-widget">
      <div className="year-summary">
        <span>THE YEAR, SO FAR</span>
        <span>
          {Math.floor((passed / days) * 100)}
          <small>%</small>
        </span>
      </div>
      <div className="year-squares" role="img" aria-label={`${passed} of ${days} days complete`}>
        {Array.from({ length: days }, (_, index) => (
          <i
            key={index}
            className={index < passed ? 'complete' : index === passed ? 'today' : ''}
          />
        ))}
      </div>
      <div className="agenda-heading">
        <h2>
          {widget.title}
          <span>.</span>
        </h2>
        <span className="tiny-label">AGENDA</span>
      </div>
      <div className="agenda-events">
        {dates.length === 0 ? (
          <div className="empty-agenda">
            <span>Room for what’s next.</span>
            <p>Add your plans in widget settings.</p>
          </div>
        ) : (
          dates.map((date) => (
            <div className="agenda-day" key={date}>
              <div className={`date-rail ${date === today ? 'today' : ''}`}>
                <span>
                  {date === today
                    ? 'TODAY'
                    : new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' })
                        .format(new Date(`${date}T12:00:00Z`))
                        .toUpperCase()}
                </span>
                <strong>{date.slice(-2)}</strong>
              </div>
              <div>
                {events
                  .filter((event) => event.start.startsWith(date))
                  .map((event) => {
                    const [hour, minute] = event.start.slice(11).split(':').map(Number);
                    const time = dashboard.hour24
                      ? event.start.slice(11)
                      : `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
                    return (
                      <div className="agenda-event" key={event.id}>
                        <span
                          className={`event-category ${event.calendar.toLowerCase() === 'work' ? 'work' : event.calendar.toLowerCase() === 'together' ? 'together' : ''}`}
                        />
                        <div>
                          <h3>{event.title}</h3>
                          <p>
                            <time dateTime={event.start}>{time}</time>
                            <span>{event.calendar}</span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="agenda-footer">
        <span>{events.length} things on the horizon</span>
        <span>
          ONE DAY AT A TIME <Moon size={11} />
        </span>
      </div>
    </div>
  );
}
