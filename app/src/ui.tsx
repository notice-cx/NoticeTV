import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Dashboard as DashboardData } from '../shared/dashboard';
import { Dashboard } from './Dashboard';

export function Wordmark() {
  return (
    <span className="wordmark">
      Notice<span>TV</span>
      <i />
    </span>
  );
}

export function CloudDrawing() {
  return (
    <svg viewBox="0 0 80 60" width="76" height="56" fill="none">
      <circle cx="47" cy="21" r="12" stroke="var(--weather)" strokeWidth="1.4" />
      <path
        d="M47 2v4M47 36v5M28 21h-5M65 21h5M34 8l-3-3M61 8l3-3"
        stroke="var(--weather)"
        strokeWidth="1.4"
      />
      <path
        d="M21 45a11 11 0 1 1 4-21 16 16 0 0 1 30 8 7 7 0 0 1 0 14Z"
        fill="var(--surface)"
        stroke="var(--secondary)"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function ScaledBoard({
  board,
  demo = false,
  passive = false,
  selected,
  onSelect,
  online = true,
  published = false,
}: {
  board: DashboardData;
  demo?: boolean;
  passive?: boolean;
  selected?: string | null;
  onSelect?: (id: string) => void;
  online?: boolean;
  published?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="scaled-board" ref={ref} style={{ aspectRatio: '16 / 9' }}>
      <div
        className="scaled-board-inner"
        style={{
          width: 1600,
          height: 900,
          transform: `scale(${width / 1600})`,
          visibility: width ? 'visible' : 'hidden',
        }}
      >
        <Dashboard
          dashboard={board}
          demo={demo}
          passive={passive}
          selected={selected}
          onSelect={onSelect}
          online={online}
          published={published}
        />
      </div>
    </div>
  );
}

export function Modal({
  title,
  eyebrow,
  close,
  children,
  wide = false,
  fullscreen = false,
}: {
  title: string;
  eyebrow: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
  fullscreen?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''} ${fullscreen ? 'fullscreen-modal' : ''}`}
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            close();
        }
      }}
    >
      <div className="modal-header">
        <div>
          <span className="tiny-label">{eyebrow}</span>
          <h2 id="modal-title">{title}</h2>
        </div>
        <button className="icon-button" onClick={close} aria-label="Close dialog">
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
