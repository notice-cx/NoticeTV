import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Home, X } from 'lucide-react';
import type { RichWidgetData } from '../../shared/rich-widgets';

export const number = (value: number | null, precision = 0) =>
  value === null
    ? '—'
    : new Intl.NumberFormat('en', { maximumFractionDigits: precision }).format(value);

export function SourceFooter({
  value,
  offline,
  demo,
  zone,
}: {
  value: RichWidgetData;
  offline: boolean;
  demo: boolean;
  zone: string;
}) {
  const stale = offline || value.stale || value.phase !== 'connected';
  if (!stale && !value.warnings.length) return null;
  return (
    <div className="rich-source-footer" title={value.warnings.join('\n')}>
      <i className={`status-dot ${stale ? 'amber' : ''}`} />
      <span>
        {demo ? 'Fictional preview' : stale ? 'Last known data' : 'Home Assistant'}
        {stale && value.updatedAt && (
          <small>
            Updated{' '}
            {new Date(value.updatedAt).toLocaleString('en', {
              timeZone: zone,
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </small>
        )}
      </span>
      {value.warnings.length > 0 && (
        <span className="rich-warning">
          {value.warnings.map((warning) => warning.split(' · ')[0]).join(' · ')}
        </span>
      )}
    </div>
  );
}
export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rich-empty">
      <Home size={30} strokeWidth={1.1} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}

export function DetailDialog({
  title,
  eyebrow,
  children,
  close,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      className={`modal rich-event-dialog ${wide ? 'wide' : ''}`}
      ref={ref}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="modal-header">
        <div>
          <span className="tiny-label">{eyebrow}</span>
          <h2 id={id}>{title}</h2>
        </div>
        <button className="icon-button" aria-label="Close details" onClick={close}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
