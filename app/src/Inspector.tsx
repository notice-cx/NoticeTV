import { useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  CloudSun,
  FileText,
  Hourglass,
  LoaderCircle,
  MapPin,
  Plus,
  Radio,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { z } from 'zod';
import {
  newId,
  validTimeZone,
  type Dashboard,
  type Widget,
  type WidgetType,
} from '../shared/dashboard';

export const catalog: {
  type: WidgetType;
  title: string;
  description: string;
  source: string;
  icon: typeof CloudSun;
  color: string;
}[] = [
  {
    type: 'weather',
    title: 'Weather',
    description: 'A sense of what’s outside. Now, and the days ahead.',
    source: 'Open-Meteo',
    icon: CloudSun,
    color: 'sand',
  },
  {
    type: 'agenda',
    title: 'Agenda',
    description: 'The plans worth looking up for, with a little perspective.',
    source: 'Your events',
    icon: CalendarDays,
    color: 'mint',
  },
  {
    type: 'video',
    title: 'Live stream',
    description: 'A window to the world. Live HLS, made for the big screen.',
    source: 'HLS video',
    icon: Radio,
    color: 'blue',
  },
  {
    type: 'note',
    title: 'Note',
    description: 'A thought, a reminder, or something good to come home to.',
    source: 'Your words',
    icon: FileText,
    color: 'lavender',
  },
  {
    type: 'countdown',
    title: 'Countdown',
    description: 'Keep a good thing on the horizon.',
    source: 'Date & time',
    icon: Hourglass,
    color: 'peach',
  },
  {
    type: 'clock',
    title: 'World clock',
    description: 'Keep another corner of the world a little closer.',
    source: 'Time zones',
    icon: Clock3,
    color: 'mint',
  },
];

export function Field({
  label,
  children,
  hint,
  required = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function BoardInspector({
  board,
  change,
  onImport,
  onExport,
}: {
  board: Dashboard;
  change: (next: Dashboard) => void;
  onImport: () => void;
  onExport: () => void;
}) {
  const [zone, setZone] = useState(board.timeZone);
  const zoneValid = validTimeZone(zone);
  return (
    <>
      <div className="inspector-heading">
        <span className="tiny-label">THE BIG PICTURE</span>
        <h2>Your dashboard</h2>
        <p>Make a little space for your everyday.</p>
      </div>
      <div className="inspector-fields">
        <Field label="Dashboard title" required>
          <input
            value={board.title}
            maxLength={80}
            required
            onChange={(event) => change({ ...board, title: event.target.value })}
          />
        </Field>
        <Field label="Subtitle">
          <input
            value={board.subtitle}
            maxLength={120}
            onChange={(event) => change({ ...board, subtitle: event.target.value })}
          />
        </Field>
        <div className="field-divider" />
        <Field
          label="Time zone"
          required
          hint={
            zoneValid
              ? 'Used for the clock, agenda, and local forecast.'
              : 'Enter a time zone such as Europe/London.'
          }
        >
          <input
            value={zone}
            required
            aria-invalid={!zoneValid}
            onChange={(event) => {
              const value = event.target.value;
              setZone(value);
              if (validTimeZone(value)) change({ ...board, timeZone: value });
            }}
            onBlur={() => {
              if (!zoneValid) setZone(board.timeZone);
            }}
          />
        </Field>
        <button
          className="text-button detect-zone"
          onClick={() => {
            const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
            setZone(value);
            change({ ...board, timeZone: value });
          }}
        >
          <MapPin size={12} /> Use this device’s time zone
        </button>
        <Field label="Temperature">
          <div className="segmented">
            {(['celsius', 'fahrenheit'] as const).map((unit) => (
              <button
                key={unit}
                aria-pressed={board.units === unit}
                className={board.units === unit ? 'active' : ''}
                onClick={() => change({ ...board, units: unit })}
              >
                {unit === 'celsius' ? 'Celsius · °C' : 'Fahrenheit · °F'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Clock">
          <div className="segmented">
            <button
              aria-pressed={!board.hour24}
              className={!board.hour24 ? 'active' : ''}
              onClick={() => change({ ...board, hour24: false })}
            >
              12 hour
            </button>
            <button
              aria-pressed={board.hour24}
              className={board.hour24 ? 'active' : ''}
              onClick={() => change({ ...board, hour24: true })}
            >
              24 hour
            </button>
          </div>
        </Field>
        <div className="field-divider" />
        <div className="inspector-tip">
          <span>Made for the room.</span>
          <p>Large type. Quiet details. A dashboard designed to be seen from across the room.</p>
        </div>
        <div className="import-export">
          <button className="secondary-button" onClick={onImport}>
            Import layout
          </button>
          <button className="secondary-button" onClick={onExport}>
            Export layout <ArrowUpRight size={12} />
          </button>
        </div>
      </div>
    </>
  );
}

export function WidgetInspector({
  widget,
  index,
  total,
  change,
  remove,
  move,
  close,
}: {
  widget: Widget;
  index: number;
  total: number;
  change: (widget: Widget) => void;
  remove: () => void;
  move: (offset: number) => void;
  close: () => void;
}) {
  const item = catalog.find((entry) => entry.type === widget.type)!;
  const Icon = item.icon;
  return (
    <>
      <div className="inspector-heading">
        <div className="inspector-type">
          <span className={`catalog-icon ${item.color}`}>
            <Icon size={19} />
          </span>
          <span className="tiny-label">{item.title}</span>
          <button className="icon-button" aria-label="Close widget settings" onClick={close}>
            <X size={15} />
          </button>
        </div>
        <h2>In the details.</h2>
        <p>
          {item.source} <ChevronRight size={11} /> {widget.title}
        </p>
      </div>
      <div className="inspector-fields">
        <Field label="Widget title" required>
          <input
            value={widget.title}
            maxLength={80}
            required
            onChange={(event) => change({ ...widget, title: event.target.value })}
          />
        </Field>
        {widget.type === 'weather' && <LocationSettings widget={widget} change={change} />}
        {widget.type === 'video' && (
          <>
            <Field
              label="Stream URL"
              hint="Use an HLS (.m3u8) stream that permits browser playback from this dashboard’s address."
            >
              <input
                type="url"
                placeholder="https://example.com/live.m3u8"
                value={widget.url}
                maxLength={2048}
                onChange={(event) => change({ ...widget, url: event.target.value })}
              />
            </Field>
            <Field label="Picture fit">
              <div className="segmented">
                <button
                  className={widget.fit === 'contain' ? 'active' : ''}
                  aria-pressed={widget.fit === 'contain'}
                  onClick={() => change({ ...widget, fit: 'contain' })}
                >
                  Fit
                </button>
                <button
                  className={widget.fit === 'cover' ? 'active' : ''}
                  aria-pressed={widget.fit === 'cover'}
                  onClick={() => change({ ...widget, fit: 'cover' })}
                >
                  Fill
                </button>
              </div>
            </Field>
            <div className="source-note">
              <Radio size={15} />
              <p>
                Starts muted. Reconnects after interruptions. Streams play directly on the screen.
              </p>
            </div>
          </>
        )}
        {widget.type === 'note' && (
          <Field label="Your note">
            <textarea
              rows={5}
              value={widget.body}
              maxLength={1000}
              onChange={(event) => change({ ...widget, body: event.target.value })}
            />
          </Field>
        )}
        {widget.type === 'countdown' && (
          <>
            <Field label="Looking forward to">
              <input
                value={widget.caption}
                maxLength={120}
                placeholder="A weekend away"
                onChange={(event) => change({ ...widget, caption: event.target.value })}
              />
            </Field>
            <Field label="Date & time" hint="Enter the time in this device’s time zone.">
              <input
                type="datetime-local"
                value={widget.target ? toLocalInput(new Date(widget.target)) : ''}
                onChange={(event) => {
                  const date = new Date(event.target.value);
                  change({
                    ...widget,
                    target: Number.isFinite(date.getTime()) ? date.toISOString() : null,
                  });
                }}
              />
            </Field>
          </>
        )}
        {widget.type === 'clock' && (
          <Field label="Time zone" hint="For example, Asia/Tokyo or Europe/Paris.">
            <input
              defaultValue={widget.timeZone}
              onBlur={(event) => {
                if (validTimeZone(event.target.value))
                  change({ ...widget, timeZone: event.target.value });
                else event.target.value = widget.timeZone;
              }}
            />
          </Field>
        )}
        {widget.type === 'agenda' && (
          <>
            <div className="field-label-row">
              <span className="field-label">Your events</span>
              <span>{widget.events.length} / 50</span>
            </div>
            <p className="field-hint">
              Times use the dashboard’s time zone. Events are entered here; external calendar sync
              is not connected.
            </p>
            <div className="event-edit-list">
              {widget.events.map((event, eventIndex) => (
                <div className="event-editor" key={event.id}>
                  <div className="event-edit-heading">
                    <span>EVENT {eventIndex + 1}</span>
                    <button
                      className="icon-button"
                      aria-label={`Remove event ${eventIndex + 1}`}
                      onClick={() =>
                        change({
                          ...widget,
                          events: widget.events.filter((entry) => entry.id !== event.id),
                        })
                      }
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <Field label={`Event ${eventIndex + 1} title`} required>
                    <input
                      value={event.title}
                      required
                      maxLength={120}
                      onChange={(input) =>
                        change({
                          ...widget,
                          events: widget.events.map((entry) =>
                            entry.id === event.id ? { ...entry, title: input.target.value } : entry,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label={`Event ${eventIndex + 1} starts`} required>
                    <input
                      type="datetime-local"
                      required
                      value={event.start}
                      onChange={(input) =>
                        change({
                          ...widget,
                          events: widget.events.map((entry) =>
                            entry.id === event.id ? { ...entry, start: input.target.value } : entry,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label={`Event ${eventIndex + 1} calendar`}>
                    <input
                      value={event.calendar}
                      maxLength={50}
                      onChange={(input) =>
                        change({
                          ...widget,
                          events: widget.events.map((entry) =>
                            entry.id === event.id
                              ? { ...entry, calendar: input.target.value }
                              : entry,
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
              ))}
            </div>
            <button
              className="secondary-button add-event"
              disabled={widget.events.length >= 50}
              onClick={() =>
                change({
                  ...widget,
                  events: [
                    ...widget.events,
                    {
                      id: newId(),
                      title: 'New plan',
                      start: toLocalInput(new Date()),
                      calendar: 'Personal',
                    },
                  ],
                })
              }
            >
              <Plus size={13} /> Add an event
            </button>
          </>
        )}
        <div className="field-divider" />
        <div className="tiny-label layout-label">ON THE CANVAS</div>
        <div className="size-fields">
          <Field label="Width">
            <select
              value={widget.width}
              onChange={(event) =>
                change({ ...widget, width: Number(event.target.value) as Widget['width'] })
              }
            >
              {[3, 4, 5, 6, 8, 12].map((width) => (
                <option key={width} value={width}>
                  {width} / 12 columns
                </option>
              ))}
            </select>
          </Field>
          <Field label="Height">
            <select
              value={widget.height}
              onChange={(event) =>
                change({ ...widget, height: Number(event.target.value) as Widget['height'] })
              }
            >
              {[2, 3, 4, 6].map((height) => (
                <option key={height} value={height}>
                  {height} rows
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="order-control">
          <span>
            Position {index + 1} of {total}
          </span>
          <button
            className="icon-button"
            aria-label="Move widget earlier"
            disabled={index === 0}
            onClick={() => move(-1)}
          >
            <ArrowUp size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Move widget later"
            disabled={index === total - 1}
            onClick={() => move(1)}
          >
            <ArrowDown size={15} />
          </button>
        </div>
        <button className="remove-widget" disabled={total === 1} onClick={remove}>
          <Trash2 size={14} /> Remove widget
        </button>
      </div>
    </>
  );
}

const placesSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country: z.string().optional(),
        admin1: z.string().optional(),
      }),
    )
    .optional(),
});
type Place = NonNullable<z.infer<typeof placesSchema>['results']>[number];
function LocationSettings({
  widget,
  change,
}: {
  widget: Extract<Widget, { type: 'weather' }>;
  change: (widget: Widget) => void;
}) {
  const [query, setQuery] = useState(widget.location);
  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function search() {
    if (query.trim().length < 2 || busy) return;
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({
        name: query.trim(),
        count: '5',
        language: 'en',
        format: 'json',
      });
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error();
      const data = placesSchema.parse(await response.json());
      setPlaces(data.results || []);
      if (!data.results?.length) setError('No locations found. Try a nearby town or city.');
    } catch {
      setError('Location search is unavailable. Try again when your connection returns.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Field label="Location">
        <div className="search-field">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a town or city"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void search();
              }
            }}
          />
          <button
            className="icon-button"
            onClick={() => {
              void search();
            }}
            disabled={busy || query.trim().length < 2}
            aria-label="Search locations"
          >
            {busy ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}
          </button>
        </div>
      </Field>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {places.length > 0 && (
        <div className="place-results">
          {places.map((place) => (
            <button
              key={place.id}
              onClick={() => {
                change({
                  ...widget,
                  location: place.name,
                  latitude: place.latitude,
                  longitude: place.longitude,
                });
                setQuery(place.name);
                setPlaces([]);
              }}
            >
              <MapPin size={13} />
              <span>
                {place.name}
                <small>{[place.admin1, place.country].filter(Boolean).join(', ')}</small>
              </span>
              <ChevronRight size={12} />
            </button>
          ))}
        </div>
      )}
      {widget.latitude !== null && (
        <div className="connected-location">
          <Check size={12} />
          <span>
            {widget.location}
            <small>Forecast connected</small>
          </span>
        </div>
      )}
    </>
  );
}

function toLocalInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
