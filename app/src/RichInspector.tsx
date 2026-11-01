import { useEffect, useState } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import type { HomeAssistantEntity } from '../shared/home-assistant';
import type { RichWidget } from '../shared/rich-widgets';
import { api, errorMessage } from './api';
import { Field } from './Field';

function Picker({
  label,
  value,
  change,
  entities,
  domains,
  hint,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  entities: HomeAssistantEntity[];
  domains: string[];
  hint?: string;
}) {
  const choices = entities.filter((entity) =>
    domains.some((domain) => entity.id.startsWith(`${domain}.`)),
  );
  return (
    <Field label={label} hint={hint}>
      <select value={value} onChange={(event) => change(event.target.value)}>
        <option value="">Choose an entity</option>
        {value && !choices.some((entity) => entity.id === value) && (
          <option value={value}>{value}</option>
        )}
        {choices.map((entity) => (
          <option key={entity.id} value={entity.id}>
            {entity.name} · {entity.id}
          </option>
        ))}
      </select>
    </Field>
  );
}
function Toggle({
  label,
  value,
  change,
}: {
  label: string;
  value: boolean;
  change: (value: boolean) => void;
}) {
  return (
    <label className="rich-toggle">
      <input type="checkbox" checked={value} onChange={(event) => change(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
const calendarColors = [
  '#82a9d1',
  '#c49fcf',
  '#d7b280',
  '#86b7a9',
  '#c79299',
  '#b2acdc',
  '#b6bd91',
  '#b1bbc9',
];

export function RichInspector({
  widget,
  change,
  demo,
  openSources,
}: {
  widget: RichWidget;
  change: (value: RichWidget) => void;
  demo: boolean;
  openSources: () => void;
}) {
  const [entities, setEntities] = useState<HomeAssistantEntity[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!demo);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (demo) return;
    let retired = false;
    setLoading(true);
    setError('');
    api<{ entities: HomeAssistantEntity[] }>('/home-assistant/entities')
      .then((result) => {
        if (!retired) setEntities(result.entities.sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch((failure) => {
        if (!retired) setError(errorMessage(failure));
      })
      .finally(() => {
        if (!retired) setLoading(false);
      });
    return () => {
      retired = true;
    };
  }, [demo, revision]);
  const visible = entities.filter((entity) =>
    `${entity.name} ${entity.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const pick = (
    label: string,
    value: string,
    domains: string[],
    update: (value: string) => void,
    hint?: string,
  ) => (
    <Picker
      label={label}
      value={value}
      entities={visible}
      domains={domains}
      change={update}
      hint={hint}
    />
  );
  return (
    <div className="rich-inspector">
      <div className="source-note">
        <p>Every reading comes through your shared Home Assistant connection.</p>
        <button className="text-button" onClick={openSources}>
          Open Sources
        </button>
      </div>
      {!demo && (
        <>
          <Field label="Find sources">
            <input
              placeholder="Name or entity ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <button
            className="text-button rich-refresh"
            onClick={() => setRevision((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw size={12} />
            {loading ? 'Loading sources' : 'Refresh sources'}
          </button>
        </>
      )}
      {demo && (
        <p className="field-hint">
          This preview uses fictional data. Choose real entities in your saved dashboard.
        </p>
      )}
      {error && (
        <p className="ha-error" role="alert">
          {error}
        </p>
      )}
      {widget.type === 'ha-weather' && (
        <>
          {pick(
            'Weather entity',
            widget.entityId,
            ['weather'],
            (entityId) => change({ ...widget, entityId }),
            'Supplies conditions and forecasts.',
          )}
          {pick(
            'Outdoor temperature',
            widget.temperatureEntityId,
            ['sensor'],
            (temperatureEntityId) => change({ ...widget, temperatureEntityId }),
            'Overrides the weather entity’s current temperature.',
          )}
          {pick('Outdoor humidity', widget.humidityEntityId, ['sensor'], (humidityEntityId) =>
            change({ ...widget, humidityEntityId }),
          )}
          {pick(
            'Air quality index',
            widget.aqiEntityId,
            ['sensor'],
            (aqiEntityId) => change({ ...widget, aqiEntityId }),
            'Uses the US AQI scale.',
          )}
          {pick(
            'Sun entity',
            widget.sunEntityId,
            ['sun'],
            (sunEntityId) => change({ ...widget, sunEntityId }),
            'Sun times also use HA’s location; moon phase is calculated locally.',
          )}
          {pick(
            'Second location weather',
            widget.secondaryEntityId,
            ['weather'],
            (secondaryEntityId) => change({ ...widget, secondaryEntityId }),
            'A current reading and five future days from another HA weather entity.',
          )}
        </>
      )}
      {widget.type === 'ha-agenda' && (
        <>
          {pick('Add calendar', '', ['calendar'], (entityId) => {
            if (
              !entityId ||
              widget.calendars.some((source) => source.entityId === entityId) ||
              widget.calendars.length >= 8
            )
              return;
            change({
              ...widget,
              calendars: [
                ...widget.calendars,
                {
                  entityId,
                  name: entities.find((entity) => entity.id === entityId)?.name || '',
                  color: calendarColors[widget.calendars.length],
                  reminders: false,
                  excludeKeywords: '',
                },
              ],
            });
          })}
          {widget.calendars.map((source, index) => {
            const update = (patch: Partial<typeof source>) =>
              change({
                ...widget,
                calendars: widget.calendars.map((entry, i) =>
                  i === index ? { ...entry, ...patch } : entry,
                ),
              });
            return (
              <div className="rich-source-editor" key={source.entityId}>
                <div className="rich-source-heading">
                  <span>{source.entityId}</span>
                  <button
                    className="icon-button"
                    aria-label={`Remove calendar ${index + 1}`}
                    onClick={() =>
                      change({
                        ...widget,
                        calendars: widget.calendars.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <X size={12} />
                  </button>
                </div>
                <Field label={`Calendar ${index + 1} name`}>
                  <input
                    value={source.name}
                    maxLength={60}
                    onChange={(event) => update({ name: event.target.value })}
                  />
                </Field>
                <Field label={`Calendar ${index + 1} color`}>
                  <input
                    type="color"
                    value={source.color}
                    onChange={(event) => update({ color: event.target.value })}
                  />
                </Field>
                <Field
                  label={`Calendar ${index + 1} hidden titles`}
                  hint="Comma-separated words or phrases."
                >
                  <input
                    value={source.excludeKeywords}
                    maxLength={500}
                    onChange={(event) => update({ excludeKeywords: event.target.value })}
                  />
                </Field>
                <Toggle
                  label={`Remind me about meetings in ${source.name || `calendar ${index + 1}`}`}
                  value={source.reminders}
                  change={(reminders) => update({ reminders })}
                />
              </div>
            );
          })}
          <Field label="Calendar view">
            <select
              value={widget.view}
              onChange={(event) =>
                change({ ...widget, view: event.target.value as 'week' | 'month' })
              }
            >
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </Field>
          <Toggle
            label="Hide finished events"
            value={widget.hideFinished}
            change={(hideFinished) => change({ ...widget, hideFinished })}
          />
          <Toggle
            label="Hide declined invitations"
            value={widget.hideDeclined}
            change={(hideDeclined) => change({ ...widget, hideDeclined })}
          />
          <Toggle
            label="Hide duplicate events"
            value={widget.hideDuplicates}
            change={(hideDuplicates) => change({ ...widget, hideDuplicates })}
          />
          <Toggle
            label="Show multi-day events"
            value={widget.showMultiDay}
            change={(showMultiDay) => change({ ...widget, showMultiDay })}
          />
        </>
      )}
      {widget.type === 'ha-climate' && (
        <>
          {widget.temperatures.map((source, index) => (
            <div className="rich-source-editor" key={index}>
              {pick(
                `Temperature ${index + 1} entity`,
                source.entityId,
                ['climate', 'sensor'],
                (entityId) =>
                  change({
                    ...widget,
                    temperatures: widget.temperatures.map((entry, i) =>
                      i === index ? { ...entry, entityId } : entry,
                    ),
                  }),
                'Thermostats use measured current_temperature, not the target setting.',
              )}
              <Field label={`Temperature ${index + 1} label`}>
                <input
                  value={source.label}
                  maxLength={60}
                  onChange={(event) =>
                    change({
                      ...widget,
                      temperatures: widget.temperatures.map((entry, i) =>
                        i === index ? { ...entry, label: event.target.value } : entry,
                      ),
                    })
                  }
                />
              </Field>
            </div>
          ))}
          {widget.temperatures.length < 2 && (
            <button
              className="secondary-button"
              onClick={() =>
                change({
                  ...widget,
                  temperatures: [...widget.temperatures, { entityId: '', label: 'Room 2' }],
                })
              }
            >
              <Plus size={12} /> Add temperature
            </button>
          )}
          {pick('CO₂ entity', widget.co2EntityId, ['sensor'], (co2EntityId) =>
            change({ ...widget, co2EntityId }),
          )}
        </>
      )}
      {widget.type === 'ha-readiness' &&
        pick(
          'Readiness score',
          widget.entityId,
          ['sensor', 'input_number'],
          (entityId) => change({ ...widget, entityId }),
          'Choose a score from 0 to 100. Recorder supplies seven days of history.',
        )}
      {widget.type === 'ha-status' && (
        <>
          {pick('Add contact sensor', '', ['binary_sensor'], (id) => {
            if (id && !widget.contacts.includes(id) && widget.contacts.length < 12)
              change({ ...widget, contacts: [...widget.contacts, id] });
          })}
          {widget.contacts.map((id) => (
            <div className="rich-contact-source" key={id}>
              <span>{entities.find((entity) => entity.id === id)?.name || id}</span>
              <button
                className="icon-button"
                aria-label={`Remove ${id}`}
                onClick={() =>
                  change({ ...widget, contacts: widget.contacts.filter((entry) => entry !== id) })
                }
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {pick('Motion sensor', widget.motionEntityId, ['binary_sensor'], (motionEntityId) =>
            change({ ...widget, motionEntityId }),
          )}
          <p className="field-hint">
            Contact sensors report on for open, off for closed. Unknown and unavailable sensors
            remain visible.
          </p>
        </>
      )}
      {widget.type === 'ha-camera' && (
        <>
          {pick('Camera entity', widget.entityId, ['camera'], (entityId) =>
            change({ ...widget, entityId }),
          )}
          {pick('Motion sensor', widget.motionEntityId, ['binary_sensor'], (motionEntityId) =>
            change({ ...widget, motionEntityId }),
          )}
          <Field
            label="Image fit"
            hint="Fit shows the full image. Fill crops the thumbnail to fill its card. Enlarged snapshots show the full image."
          >
            <select
              value={widget.fit}
              onChange={(event) =>
                change({ ...widget, fit: event.target.value as 'contain' | 'cover' })
              }
            >
              <option value="contain">Fit</option>
              <option value="cover">Fill</option>
            </select>
          </Field>
          <p className="field-hint">
            Snapshots refresh every 20 seconds while visible. Update times and interruption status
            stay visible. This widget does not start a live video stream.
          </p>
        </>
      )}
    </div>
  );
}
