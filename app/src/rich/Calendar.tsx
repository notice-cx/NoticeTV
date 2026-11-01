import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { Dashboard, WidgetOf } from '../../shared/dashboard';
import type { RichWidgetData, CalendarEvent } from '../../shared/rich-widgets';
import { calendarMidnight, dateKey, offsetDay } from '../../shared/ha-data';
import { DetailDialog } from './ui';

export function ConnectedAgenda({
  value,
  widget,
  board,
  now,
  passive,
  unavailable,
  open,
}: {
  value: Extract<RichWidgetData, { type: 'ha-agenda' }>['data'];
  widget: WidgetOf<'ha-agenda'>;
  board: Dashboard;
  now: Date;
  passive: boolean;
  unavailable: boolean;
  open: (event: CalendarEvent) => void;
}) {
  const [view, setView] = useState(widget.view);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  useEffect(() => {
    setView(widget.view);
    setSelectedDay(null);
  }, [widget.view]);
  const today = dateKey(now, board.timeZone),
    year = Number(today.slice(0, 4));
  const passed = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.UTC(year, 0, 1)) / 86_400_000),
    total = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
  const inDay = (event: CalendarEvent, day: string) =>
    dateKey(new Date(event.start), board.timeZone) <= day &&
    dateKey(new Date(Date.parse(event.end) - 1), board.timeZone) >= day;
  const monthStart = `${today.slice(0, 8)}01`;
  const nextMonth = new Date(`${monthStart}T12:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const monthEnd = nextMonth.toISOString().slice(0, 10);
  const events = value.events.filter((event) =>
    selectedDay
      ? inDay(event, selectedDay)
      : view === 'month'
        ? Date.parse(event.start) < calendarMidnight(monthEnd, board.timeZone).getTime() &&
          Date.parse(event.end) > calendarMidnight(monthStart, board.timeZone).getTime()
        : Date.parse(event.end) > calendarMidnight(today, board.timeZone).getTime() &&
          dateKey(new Date(event.start), board.timeZone) < offsetDay(today, 7),
  );
  const displayDay = (event: CalendarEvent) =>
    selectedDay ||
    [dateKey(new Date(event.start), board.timeZone), view === 'week' ? today : monthStart]
      .sort()
      .at(-1)!;
  const dates = [...new Set(events.map(displayDay))];
  const shortDay = (day: string) =>
    new Intl.DateTimeFormat('en', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(
      new Date(`${day}T12:00:00Z`),
    );
  const time = (date: string) =>
    new Intl.DateTimeFormat('en', {
      timeZone: board.timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: !board.hour24,
    }).format(new Date(date));
  const eventTime = (event: CalendarEvent) => {
    const first = dateKey(new Date(event.start), board.timeZone),
      last = dateKey(new Date(Date.parse(event.end) - 1), board.timeZone);
    return first !== last
      ? `${shortDay(first)}–${shortDay(last)}`
      : event.allDay
        ? 'All day'
        : `${time(event.start)}–${time(event.end)}`;
  };
  const meeting = value.nextMeeting;
  const minutes = meeting ? Math.ceil((Date.parse(meeting.start) - now.getTime()) / 60_000) : -1;
  const leading = (new Date(`${monthStart}T12:00:00Z`).getUTCDay() + 6) % 7;
  const first = offsetDay(monthStart, -leading);
  return (
    <div className="connected-agenda-content">
      <div className="connected-year">
        <div className="connected-year-score">
          <strong>
            {((passed / total) * 100).toFixed(1)}
            <small>%</small>
          </strong>
          <span>{year} elapsed</span>
        </div>
        <div className="connected-year-grid">
          <div
            className="year-squares"
            role="img"
            aria-label={`${passed} of ${total} days complete`}
          >
            {Array.from({ length: total }, (_, index) => (
              <i
                key={index}
                className={index < passed ? 'complete' : index === passed ? 'today' : ''}
              />
            ))}
          </div>
          <div className="connected-year-labels">
            <span>{passed} days passed</span>
            <span>{total - passed} left</span>
          </div>
        </div>
      </div>
      <div className="connected-agenda-heading">
        <h3>
          {view === 'week'
            ? 'The week ahead.'
            : new Intl.DateTimeFormat('en', { timeZone: board.timeZone, month: 'long' }).format(
                now,
              )}
        </h3>
        {passive ? (
          <span className="tiny-label">{view}</span>
        ) : (
          <div className="calendar-view-switch">
            {(['week', 'month'] as const).map((name) => (
              <button
                key={name}
                aria-pressed={view === name}
                onClick={() => {
                  setView(name);
                  setSelectedDay(null);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="connected-agenda-period">
        {selectedDay
          ? shortDay(selectedDay)
          : view === 'week'
            ? `${shortDay(today)} — ${shortDay(offsetDay(today, 6))}`
            : String(year)}{' '}
        · {events.length} {events.length === 1 ? 'plan' : 'plans'}
      </p>
      {unavailable && (
        <p className="connected-agenda-warning">
          Calendar source interrupted · Showing available events
        </p>
      )}
      {minutes >= 0 && (
        <div className="meeting-reminder">
          <span>UP NEXT · {minutes === 0 ? 'STARTING NOW' : `IN ${minutes} MIN`}</span>
          <strong>{meeting!.title}</strong>
          <small>
            {time(meeting!.start)} · {meeting!.calendar}
          </small>
        </div>
      )}
      {view === 'month' && (
        <div className="month-calendar" aria-label="Month overview">
          <div className="month-weekdays">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
              <span key={index}>{day}</span>
            ))}
          </div>
          <div className="month-days">
            {Array.from({ length: 42 }, (_, index) => {
              const key = offsetDay(first, index),
                dayEvents = value.events.filter((event) => inDay(event, key));
              const content = (
                <>
                  <span>{Number(key.slice(8))}</span>
                  <i>
                    {dayEvents.slice(0, 3).map((event) => (
                      <b key={event.id} style={{ background: event.color }} />
                    ))}
                  </i>
                </>
              );
              const className = `${key === today ? 'today' : ''} ${selectedDay === key ? 'selected' : ''} ${key.slice(0, 7) !== today.slice(0, 7) ? 'outside' : ''}`;
              return passive ? (
                <div key={key} className={className}>
                  {content}
                </div>
              ) : (
                <button
                  key={key}
                  className={className}
                  aria-label={`Show events for ${key}`}
                  aria-pressed={selectedDay === key}
                  onClick={() => setSelectedDay(selectedDay === key ? null : key)}
                >
                  {content}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div
        className="connected-agenda-list"
        tabIndex={0}
        role="region"
        aria-label="Calendar events"
      >
        {dates.length ? (
          dates.map((day) => (
            <div className="connected-day" key={day}>
              <div className={`connected-date-rail ${day === today ? 'today' : ''}`}>
                <span>
                  {day === today
                    ? 'TODAY'
                    : new Intl.DateTimeFormat('en', { timeZone: 'UTC', weekday: 'short' })
                        .format(new Date(`${day}T12:00:00Z`))
                        .toUpperCase()}
                </span>
                <strong>{Number(day.slice(8))}</strong>
                <small>
                  {new Intl.DateTimeFormat('en', { timeZone: 'UTC', month: 'short' })
                    .format(new Date(`${day}T12:00:00Z`))
                    .toUpperCase()}
                </small>
              </div>
              <div className="connected-day-events">
                {events
                  .filter((event) => displayDay(event) === day)
                  .map((event) => {
                    const content = (
                      <>
                        <i style={{ background: event.color }} />
                        <span>
                          <strong>{event.title}</strong>
                          <small>
                            {event.calendar}
                            {event.location ? ` · ${event.location}` : ''}
                          </small>
                        </span>
                        <time>{eventTime(event)}</time>
                      </>
                    );
                    return passive ? (
                      <div
                        className={`connected-event ${event.allDay ? 'is-all-day' : ''}`}
                        key={event.id}
                        style={
                          event.allDay
                            ? { background: `color-mix(in srgb, ${event.color} 13%, transparent)` }
                            : undefined
                        }
                      >
                        {content}
                      </div>
                    ) : (
                      <button
                        className={`connected-event ${event.allDay ? 'is-all-day' : ''}`}
                        key={event.id}
                        onClick={() => open(event)}
                        style={
                          event.allDay
                            ? { background: `color-mix(in srgb, ${event.color} 13%, transparent)` }
                            : undefined
                        }
                      >
                        {content}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))
        ) : (
          <div className="connected-agenda-empty">
            <CalendarDays size={25} strokeWidth={1} />
            <p>
              {unavailable ? 'Calendar data unavailable. Retrying.' : 'A little room in your day.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
export function EventDialog({
  event,
  board,
  close,
}: {
  event: CalendarEvent;
  board: Dashboard;
  close: () => void;
}) {
  const date = (value: string) =>
    new Intl.DateTimeFormat('en', {
      timeZone: board.timeZone,
      dateStyle: 'full',
      ...(event.allDay ? {} : { timeStyle: 'short', hour12: !board.hour24 }),
    }).format(new Date(value));
  return (
    <DetailDialog title={event.title} eyebrow={event.calendar} close={close}>
      <p>
        {event.allDay
          ? `All day · ${date(event.start)}${dateKey(new Date(event.start), board.timeZone) === dateKey(new Date(Date.parse(event.end) - 1), board.timeZone) ? '' : ` – ${date(new Date(Date.parse(event.end) - 1).toISOString())}`}`
          : `${date(event.start)} – ${date(event.end)}`}
      </p>
      {event.location && <p>{event.location}</p>}
      {event.description && <p className="event-description">{event.description}</p>}
    </DetailDialog>
  );
}
