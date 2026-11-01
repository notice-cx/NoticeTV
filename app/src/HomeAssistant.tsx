import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, Home, LoaderCircle, Search } from 'lucide-react';
import {
  connectionLabels,
  type HomeAssistantData,
  type HomeAssistantEntity,
  type HomeAssistantStatus,
} from '../shared/home-assistant';
import type { WidgetOf } from '../shared/dashboard';
import { api, errorMessage } from './api';

const emptyData: HomeAssistantData = { phase: 'not_configured', receivedAt: null, entities: {} };

export function useHomeAssistantData(ids: string[], demo: boolean) {
  const selection = [...new Set(ids)].sort().join(',');
  const [result, setResult] = useState<{
    selection: string;
    data: HomeAssistantData;
    offline: boolean;
  }>({ selection, data: emptyData, offline: false });
  useEffect(() => {
    if (!selection || demo) return;
    let retired = false;
    let timer: ReturnType<typeof setTimeout>;
    const update = async () => {
      if (!document.hidden) {
        try {
          const data = await api<HomeAssistantData>(
            `/home-assistant/data?entities=${encodeURIComponent(selection)}`,
          );
          if (!retired) setResult({ selection, data, offline: false });
        } catch {
          if (!retired) setResult((old) => ({ ...old, offline: true }));
        }
      }
      if (!retired) timer = setTimeout(update, 2000);
    };
    void update();
    return () => {
      retired = true;
      clearTimeout(timer);
    };
  }, [selection, demo]);
  return result.selection === selection ? result : { selection, data: emptyData, offline: false };
}

export function HomeAssistantSetup({ demo }: { demo: boolean }) {
  const [status, setStatus] = useState<HomeAssistantStatus | null>(null);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (demo) return;
    let retired = false;
    let timer: ReturnType<typeof setTimeout>;
    let initial = true;
    const update = async () => {
      try {
        const next = await api<HomeAssistantStatus>('/home-assistant');
        if (!retired) {
          setStatus(next);
          if (initial) {
            setUrl(next.url || '');
            initial = false;
          }
        }
      } catch (failure) {
        if (!retired) setError(errorMessage(failure));
      }
      if (!retired) timer = setTimeout(update, 3000);
    };
    void update();
    return () => {
      retired = true;
      clearTimeout(timer);
    };
  }, [demo]);
  const needsToken = !status?.url || url.replace(/\/$/, '') !== status.url;
  async function save() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await api<HomeAssistantStatus>('/home-assistant', 'PUT', {
        url,
        ...(token.trim() ? { token } : {}),
      });
      setStatus(next);
      setUrl(next.url || '');
      setToken('');
      setNotice('Connection saved. Choose an entity in a Home Assistant widget.');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setStatus(await api<HomeAssistantStatus>('/home-assistant', 'DELETE', {}));
      setUrl('');
      setToken('');
      setNotice('Home Assistant disconnected.');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ha-connection" aria-label="Home Assistant connection">
      <div className="ha-connection-heading">
        <span className="source-icon">
          <Home size={20} />
        </span>
        <div>
          <h3>Home Assistant</h3>
          <p>Your home’s data, in one connection.</p>
        </div>
      </div>
      {demo ? (
        <p className="field-hint">
          Connect Home Assistant in your saved dashboard to use real entities.
        </p>
      ) : (
        <>
          <p className="ha-connection-status" role="status">
            <i className={`status-dot ${status?.phase === 'connected' ? '' : 'amber'}`} />
            {status ? connectionLabels[status.phase] : 'Loading connection'}
            {status?.phase === 'connected' && (
              <span>
                {status.entityCount} {status.entityCount === 1 ? 'entity' : 'entities'}
              </span>
            )}
          </p>
          <p className="field-hint">
            Home Assistant supplies the data. NoticeTV reads it through this shared server
            connection.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={busy || !status}>
              <label className="field">
                <span>
                  Home Assistant address <span aria-hidden="true">*</span>
                </span>
                <input
                  type="url"
                  required
                  value={url}
                  placeholder="http://homeassistant.local:8123"
                  maxLength={2048}
                  autoComplete="url"
                  onChange={(event) => setUrl(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Access token{needsToken && <span aria-hidden="true"> *</span>}</span>
                <input
                  type="password"
                  required={needsToken}
                  value={token}
                  maxLength={8192}
                  autoComplete="new-password"
                  onChange={(event) => setToken(event.target.value)}
                />
                <small>
                  {needsToken
                    ? 'Create a long-lived access token in your Home Assistant profile.'
                    : 'Leave blank to keep the saved token.'}
                </small>
              </label>
              <p className="field-hint">
                Saving checks the connection and applies it to every screen. The token stays on the
                server and is excluded from layout exports.
              </p>
              <div className="ha-connection-actions">
                <button className="primary-button" type="submit">
                  {busy && <LoaderCircle size={14} className="spin" />}
                  {busy
                    ? 'Checking connection'
                    : status?.url
                      ? 'Save connection'
                      : 'Connect Home Assistant'}
                </button>
                {status?.url && (
                  <button className="text-button" type="button" onClick={() => void disconnect()}>
                    Disconnect
                  </button>
                )}
              </div>
            </fieldset>
          </form>
          {status?.phase === 'auth_failed' && (
            <p className="ha-error">Create a new token in Home Assistant, then save it here.</p>
          )}
          {error && (
            <p role="alert" className="ha-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="field-hint">
              {notice}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function EntitySettings({
  widget,
  change,
  demo,
}: {
  widget: WidgetOf<'entity'>;
  change: (widget: WidgetOf<'entity'>) => void;
  demo: boolean;
}) {
  const [entities, setEntities] = useState<HomeAssistantEntity[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!demo);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (demo) return;
    let retired = false;
    setLoading(true);
    setError('');
    api<{ entities: HomeAssistantEntity[] }>('/home-assistant/entities')
      .then((data) => {
        if (!retired) setEntities(data.entities.sort((a, b) => a.name.localeCompare(b.name)));
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
  }, [demo, retry]);
  const matches = entities.filter((entity) =>
    `${entity.name} ${entity.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const current = entities.find((entity) => entity.id === widget.entityId);
  return (
    <div className="ha-entity-settings">
      <label className="field">
        <span>Find an entity</span>
        <span className="ha-search">
          <Search size={14} />
          <input
            value={search}
            placeholder="Name or entity ID"
            onChange={(event) => setSearch(event.target.value)}
          />
        </span>
      </label>
      <label className="field">
        <span>Home Assistant entity</span>
        <select
          value={widget.entityId}
          onChange={(event) => change({ ...widget, entityId: event.target.value })}
        >
          <option value="">Choose an entity</option>
          {widget.entityId && !matches.some((entity) => entity.id === widget.entityId) && (
            <option value={widget.entityId}>{current?.name || widget.entityId}</option>
          )}
          {matches.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name} · {entity.id}
            </option>
          ))}
        </select>
        <small>
          {current
            ? `${current.state}${current.unit ? ` ${current.unit}` : ''} · ${current.id}`
            : widget.entityId || 'Connect Home Assistant in Sources to load your entities.'}
        </small>
      </label>
      <div className="ha-picker-status">
        <span>
          {loading
            ? 'Loading entities'
            : demo
              ? 'Real entities are available in your saved dashboard.'
              : `${matches.length} matching ${matches.length === 1 ? 'entity' : 'entities'}`}
        </span>
        {!demo && (
          <button
            className="text-button"
            onClick={() => setRetry((value) => value + 1)}
            disabled={loading}
          >
            Refresh
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="ha-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function EntityWidget({
  widget,
  data,
  offline,
  demo,
}: {
  widget: WidgetOf<'entity'>;
  data: HomeAssistantData;
  offline: boolean;
  demo: boolean;
}) {
  const entity = data.entities[widget.entityId];
  const stale = offline || data.phase !== 'connected';
  const unavailable = entity?.state === 'unavailable' || entity?.state === 'unknown';
  const value = unavailable ? '—' : entity?.state;
  const numeric = value !== undefined && value.trim() !== '' && Number.isFinite(Number(value));
  const formatted = numeric
    ? new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(Number(value))
    : value?.replaceAll('_', ' ');
  const updated =
    entity?.lastUpdated && Number.isFinite(Date.parse(entity.lastUpdated))
      ? new Date(entity.lastUpdated).toLocaleString()
      : null;
  return (
    <div className="entity-widget">
      <div className="widget-heading">
        <span className="tiny-label">{widget.title}</span>
        <Activity size={17} />
      </div>
      {entity ? (
        <>
          <div className={`entity-value ${numeric ? '' : 'is-text'}`}>
            {formatted}
            <span>{!unavailable && entity.unit}</span>
          </div>
          <div className="entity-name">{entity.name}</div>
          <div className="entity-status">
            <i className={`status-dot ${stale || unavailable ? 'amber' : ''}`} />
            <span>
              {unavailable ? 'Entity unavailable' : stale ? 'Last known reading' : 'Home Assistant'}
              {updated && (stale || unavailable) && <small>Updated {updated}</small>}
            </span>
          </div>
        </>
      ) : (
        <div className="entity-empty">
          <Home size={28} strokeWidth={1.2} />
          <h3>{!widget.entityId ? 'A little closer to home.' : 'Waiting for your home.'}</h3>
          <p>
            {demo
              ? 'Choose an entity in your saved dashboard.'
              : !widget.entityId
                ? 'Connect Home Assistant in Sources, then choose an entity.'
                : data.phase === 'connected'
                  ? 'This entity is no longer available in Home Assistant.'
                  : 'Readings will appear when the connection is available.'}
          </p>
          <ArrowUpRight size={16} />
        </div>
      )}
    </div>
  );
}
