import { useEffect, useState } from 'react';
import { ArrowUpRight, Camera } from 'lucide-react';
import type { Dashboard, WidgetOf } from '../../shared/dashboard';
import type { StatusData } from '../../shared/rich-widgets';
import { DetailDialog } from './ui';
import { Motion } from './Sensors';

export function CameraSnapshot({
  widget,
  board,
  demo,
  published,
  motion,
  passive,
  staleData,
}: {
  widget: WidgetOf<'ha-camera'>;
  board: Dashboard;
  demo: boolean;
  published: boolean;
  motion: StatusData['motion'];
  passive: boolean;
  staleData: boolean;
}) {
  const key = JSON.stringify({ id: widget.id, entityId: widget.entityId, published });
  const [snapshot, setSnapshot] = useState<{
    key: string;
    url: string;
    time: string;
    stale: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (demo || !widget.entityId) return;
    let retired = false,
      running = false,
      currentUrl = '';
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    setError('');
    const update = async () => {
      if (retired || running) return;
      clearTimeout(timer);
      if (!document.hidden) {
        running = true;
        try {
          const response = await fetch(
            published
              ? `/api/home-assistant/widgets/${widget.id}/snapshot`
              : '/api/home-assistant/camera-preview',
            {
              method: published ? 'GET' : 'POST',
              credentials: 'same-origin',
              cache: 'no-store',
              headers: published ? undefined : { 'Content-Type': 'application/json' },
              body: published
                ? undefined
                : JSON.stringify({ widget, timeZone: board.timeZone, units: board.units }),
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
            },
          );
          if (!response.ok) {
            if ([401, 403, 404].includes(response.status)) {
              if (currentUrl) URL.revokeObjectURL(currentUrl);
              currentUrl = '';
              if (!retired) setSnapshot(null);
            }
            throw new Error('Camera unavailable. Retrying.');
          }
          const blob = await response.blob();
          if (retired) return;
          const url = URL.createObjectURL(blob),
            old = currentUrl;
          currentUrl = url;
          setSnapshot({
            key,
            url,
            time: response.headers.get('X-NoticeTV-Captured-At') || new Date().toISOString(),
            stale: response.headers.get('X-NoticeTV-Stale') === '1',
          });
          setError('');
          if (old) URL.revokeObjectURL(old);
        } catch (failure) {
          if (!retired)
            setError(failure instanceof Error ? failure.message : 'Camera unavailable.');
        } finally {
          running = false;
        }
      }
      if (!retired) timer = setTimeout(update, 20_000);
    };
    void update();
    document.addEventListener('visibilitychange', update);
    window.addEventListener('online', update);
    return () => {
      retired = true;
      clearTimeout(timer);
      controller.abort();
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('online', update);
    };
  }, [key, demo]);
  const current = snapshot?.key === key ? snapshot : null;
  const image = demo ? '/demo-front-door.svg' : current?.url;
  return (
    <div className="camera-content">
      <div className="camera-image">
        {image ? (
          <img
            src={image}
            alt={demo ? 'Illustrated front-door preview' : `${widget.title} camera snapshot`}
            style={{ objectFit: widget.fit }}
          />
        ) : (
          <div className="camera-empty">
            <Camera size={32} strokeWidth={1} />
            <p>{error || 'Loading camera snapshot'}</p>
          </div>
        )}
        {current && (error || current.stale || staleData) && (
          <div className="camera-stale">Last known image · retrying</div>
        )}
        {!passive && image && (
          <button
            className="camera-expand"
            aria-label={`Enlarge ${widget.title} snapshot`}
            onClick={() => setExpanded(true)}
          >
            <ArrowUpRight size={16} />
          </button>
        )}
      </div>
      <div className="camera-caption">
        <span>
          {demo
            ? 'Illustrated preview'
            : current
              ? `Updated ${new Intl.DateTimeFormat('en', { timeZone: board.timeZone, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: !board.hour24 }).format(new Date(current.time))}`
              : 'Waiting for camera'}
        </span>
        <Motion value={motion} />
      </div>
      {expanded && image && (
        <DetailDialog
          title={widget.title}
          eyebrow={demo ? 'Illustrated preview' : 'Camera snapshot'}
          close={() => setExpanded(false)}
          wide
        >
          <img
            className="expanded-snapshot"
            src={image}
            alt={demo ? 'Illustrated front-door preview' : `${widget.title} camera snapshot`}
          />
        </DetailDialog>
      )}
    </div>
  );
}
