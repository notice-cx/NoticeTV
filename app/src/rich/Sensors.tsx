import {
  CircleHelp,
  DoorClosed,
  DoorOpen,
  Footprints,
  HeartPulse,
  ShieldCheck,
} from 'lucide-react';
import type { RichWidgetData, HistorySeries, StatusData } from '../../shared/rich-widgets';
import { historyPath } from '../../shared/ha-data';
import { number } from './ui';

function Chart({
  series,
  start,
  end,
  label,
  temperature = false,
}: {
  series: HistorySeries[];
  start: number;
  end: number;
  label: string;
  temperature?: boolean;
}) {
  const values = series
    .flatMap((item) => item.points.map((point) => point.value))
    .filter((value): value is number => value !== null);
  if (!values.length) return <div className="rich-chart-empty">History unavailable</div>;
  const low = Math.min(...values) - (temperature ? 0.5 : 25),
    high = Math.max(...values) + (temperature ? 0.5 : 25);
  return (
    <div className="rich-chart">
      <svg viewBox="0 0 360 80" role="img" aria-label={label} preserveAspectRatio="none">
        {[15, 40, 65].map((y) => (
          <line key={y} x1="2" x2="358" y1={y} y2={y} stroke="var(--line)" />
        ))}
        {series.map((item, index) => (
          <path
            key={item.id}
            d={historyPath(item.points, start, end, low, high)}
            fill="none"
            stroke={index === 0 ? 'var(--accent)' : 'var(--weather)'}
            strokeWidth="1.5"
            strokeDasharray={index ? '4 4' : undefined}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <span className="chart-high">{number(high, temperature ? 1 : 0)}</span>
      <span className="chart-low">{number(low, temperature ? 1 : 0)}</span>
    </div>
  );
}
export function Climate({
  value,
}: {
  value: Extract<RichWidgetData, { type: 'ha-climate' }>['data'];
}) {
  return (
    <div className="climate-content">
      <div className="climate-readings">
        {value.temperatures.map((source, index) => (
          <div key={`${source.id}-${index}`}>
            <span>
              <i className={`series-key series-${index}`} />
              {source.name}
            </span>
            <strong>
              {number(source.value, 1)}
              <small>{source.unit}</small>
            </strong>
          </div>
        ))}
      </div>
      {value.temperatures.length > 0 && (
        <Chart
          series={value.temperatures}
          start={value.start}
          end={value.end}
          temperature
          label="Measured indoor temperatures over the last 24 hours"
        />
      )}
      {value.co2 && (
        <>
          <div className="climate-co2">
            <span>CO₂</span>
            <strong
              className={
                value.co2.unit?.toLowerCase() === 'ppm' && value.co2.value !== null
                  ? value.co2.value >= 1500
                    ? 'tone-negative'
                    : value.co2.value >= 900
                      ? 'tone-warning'
                      : ''
                  : ''
              }
            >
              {number(value.co2.value)}
              <small>{value.co2.unit}</small>
            </strong>
          </div>
          <Chart
            series={[value.co2]}
            start={value.start}
            end={value.end}
            label="Indoor carbon dioxide over the last 24 hours"
          />
        </>
      )}
      <div className="chart-time-labels">
        <span>24 HOURS AGO</span>
        <span>NOW</span>
      </div>
    </div>
  );
}
export function Readiness({
  value,
}: {
  value: Extract<RichWidgetData, { type: 'ha-readiness' }>['data'];
}) {
  const score = value.score.value;
  const points = value.points.filter((point) => point.value !== null);
  const low = Math.min(30, ...points.map((point) => point.value!)) - 5;
  return (
    <div className="readiness-content">
      {points.length ? (
        <svg
          className="readiness-trend"
          viewBox="0 0 360 160"
          role="img"
          aria-label="Seven-day readiness history"
          preserveAspectRatio="none"
        >
          <path
            d={historyPath(value.points, value.start, value.end, low, 102, 360, 160)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <div className="readiness-no-history">History unavailable</div>
      )}
      <svg
        viewBox="0 0 120 120"
        className="readiness-ring"
        aria-label={score === null ? 'Readiness unavailable' : `Readiness ${score} out of 100`}
        role="img"
      >
        <circle cx="60" cy="60" r="47" fill="none" stroke="var(--line-strong)" strokeWidth="5" />
        <circle
          cx="60"
          cy="60"
          r="47"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(score || 0) * 2.953} 295.3`}
          transform="rotate(-90 60 60)"
        />
        <circle cx="60" cy="60" r="37" fill="none" stroke="var(--line)" strokeWidth="1" />
        <HeartPulse x="46" y="46" width="28" height="28" strokeWidth="1" />
      </svg>
      <div className="readiness-main">
        <div>
          <strong>{number(score)}</strong>
          <p>
            {score === null
              ? 'Awaiting a reading'
              : score >= 85
                ? 'Optimal'
                : score >= 70
                  ? 'Good'
                  : 'Take it easy'}
          </p>
        </div>
      </div>
      <div className="readiness-average">
        <span>PAST SEVEN DAYS</span>
        <span>
          {value.average === null ? 'History unavailable' : `AVG ${number(value.average)}`}
        </span>
      </div>
    </div>
  );
}
export function Motion({ value }: { value: StatusData['motion'] }) {
  return value === null ? null : (
    <span
      className={`motion-status ${value === 'active' ? 'tone-warning' : value === 'unavailable' ? 'tone-negative' : ''}`}
    >
      <Footprints size={13} />
      {value === 'active'
        ? 'Motion detected'
        : value === 'clear'
          ? 'No motion'
          : 'Motion unavailable'}
    </span>
  );
}
export function HomeStatus({ value }: { value: StatusData }) {
  const open = value.contacts.filter((contact) => contact.state === 'open').length;
  const unknown = value.contacts.filter((contact) => contact.state === 'unavailable').length;
  return (
    <div className="home-status-content">
      <div className="home-status-summary">
        <ShieldCheck size={27} strokeWidth={1.1} />
        <strong>
          {!value.contacts.length
            ? 'No contacts selected'
            : open
              ? `${open} open`
              : unknown
                ? 'Status unavailable'
                : 'All closed'}
        </strong>
        {unknown > 0 && <span>{unknown} unavailable</span>}
      </div>
      <div
        className="contact-status-list"
        tabIndex={0}
        role="region"
        aria-label="Contact sensor status"
      >
        {value.contacts.map((contact) => (
          <div
            key={contact.id}
            className={
              contact.state === 'open'
                ? 'tone-warning'
                : contact.state === 'unavailable'
                  ? 'tone-negative'
                  : ''
            }
          >
            {contact.state === 'open' ? (
              <DoorOpen size={15} />
            ) : contact.state === 'closed' ? (
              <DoorClosed size={15} />
            ) : (
              <CircleHelp size={15} />
            )}
            <span>
              {contact.name}
              <small>{contact.state}</small>
            </span>
          </div>
        ))}
      </div>
      <Motion value={value.motion} />
    </div>
  );
}
