import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  CircleHelp,
  Copy,
  Download,
  Eye,
  Grid2X2,
  Layers3,
  LoaderCircle,
  LogOut,
  Monitor,
  Plus,
  Radio,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  createDashboard,
  createDemoDashboard,
  createWidget,
  dashboardSchema,
  type Dashboard as DashboardData,
  type Document,
  type Widget,
  type WidgetType,
} from '../shared/dashboard';
import { api, ApiError, errorMessage as message, saveDashboard } from './api';
import { AccessForm } from './Login';
import { BoardInspector, catalog, WidgetInspector } from './Inspector';
import { Wordmark, CloudDrawing, ScaledBoard, Modal } from './ui';

export function Editor({
  demo = false,
  onDisconnect,
}: {
  demo?: boolean;
  onDisconnect?: () => void;
}) {
  const [document, setDocument] = useState<Document | null>(null);
  const [board, setBoard] = useState<DashboardData>(() =>
    demo ? createDemoDashboard() : createDashboard(),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<'settings' | 'widgets' | 'sources'>('settings');
  const [modal, setModal] = useState<
    'library' | 'pair' | 'preview' | 'help' | 'demo' | 'reconnect' | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(demo);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [pairing, setPairing] = useState<{ code: string; expires: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saved = JSON.stringify(document?.draft);
  const dirty = !demo && loaded && JSON.stringify(board) !== saved;
  const unpublished = demo || JSON.stringify(board) !== JSON.stringify(document?.published);
  const widget = board.widgets.find((entry) => entry.id === selected);

  useEffect(() => {
    if (demo) return;
    let retired = false;
    api<Document>('/document')
      .then((value) => {
        if (!retired) {
          setDocument(value);
          setBoard(value.draft);
          setLoaded(true);
        }
      })
      .catch((failure) => {
        if (!retired) setError(message(failure));
      });
    return () => {
      retired = true;
    };
  }, [demo]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function save(publish: boolean) {
    if (demo) {
      setModal('demo');
      return;
    }
    if (!document || busy) return;
    const result = dashboardSchema.safeParse(board);
    if (!result.success) {
      setError(result.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await saveDashboard(result.data, document.revision, publish);
      setDocument(next);
      setToast(
        publish
          ? 'Published. Connected screens will update within 10 seconds.'
          : 'Draft saved. Your screen still shows the published version.',
      );
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) setModal('reconnect');
      else setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        void save(false);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  });
  function changeWidget(next: Widget) {
    setBoard((old) => ({
      ...old,
      widgets: old.widgets.map((entry) => (entry.id === next.id ? next : entry)),
    }));
  }
  function addWidget(type: WidgetType) {
    if (board.widgets.length >= 20) {
      setToast('A dashboard can hold up to 20 widgets.');
      return;
    }
    const next = createWidget(type);
    setBoard((old) => ({ ...old, widgets: [...old.widgets, next] }));
    setSelected(next.id);
    setPanel('settings');
    setModal(null);
  }
  function moveWidget(id: string, destination: number) {
    setBoard((old) => {
      const widgets = [...old.widgets];
      const index = widgets.findIndex((entry) => entry.id === id);
      const [entry] = widgets.splice(index, 1);
      widgets.splice(Math.max(0, Math.min(widgets.length, destination)), 0, entry);
      return { ...old, widgets };
    });
  }
  async function pair() {
    if (demo) {
      setModal('demo');
      return;
    }
    setPairing(null);
    setModal('pair');
    setCopied(false);
    setError('');
    try {
      setPairing(await api('/pairing', 'POST', {}));
    } catch (failure) {
      setError(message(failure));
    }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 128 * 1024) {
      setError('Choose a layout smaller than 128 KB.');
      return;
    }
    try {
      const next = dashboardSchema.parse(JSON.parse(await file.text()));
      setBoard(next);
      setSelected(null);
      setToast('Layout imported into your draft.');
    } catch {
      setError('This file is not a valid NoticeTV layout.');
    }
    if (fileRef.current) fileRef.current.value = '';
  }
  function exportFile() {
    const blob = new Blob([`${JSON.stringify(board, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = 'noticetv-layout.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main className="editor">
      <header className="editor-header">
        <a className="brand-link" href={demo ? '/demo' : '/'} aria-label="NoticeTV editor">
          <Wordmark />
        </a>
        <span className="header-divider" />
        <div className="workspace-name">
          {demo ? 'The demo workspace' : 'Your workspace'}
          <span className={`workspace-tag ${demo ? 'demo-tag' : ''}`}>
            {demo ? 'DEMO' : 'SELF-HOSTED'}
          </span>
        </div>
        <div className="header-actions">
          <span className="save-state">
            <i className={`status-dot ${unpublished ? 'amber' : ''}`} />
            {demo
              ? 'Try things out'
              : dirty
                ? 'Unsaved changes'
                : unpublished
                  ? 'Draft saved'
                  : 'All changes published'}
          </span>
          <button
            className="secondary-button save-draft"
            onClick={() => {
              void save(false);
            }}
            disabled={busy || (!demo && (!dirty || !loaded))}
          >
            Save draft
          </button>
          <button
            className="primary-button publish-button"
            disabled={busy || (!demo && !loaded)}
            onClick={() => {
              void save(true);
            }}
          >
            {busy ? <LoaderCircle size={14} className="spin" /> : <ArrowUpRight size={15} />}{' '}
            Publish
          </button>
        </div>
      </header>
      <nav className="editor-nav" aria-label="Workspace">
        <button
          className={panel === 'settings' ? 'active' : ''}
          title="Canvas settings"
          aria-label="Canvas settings"
          onClick={() => {
            setPanel('settings');
            setSelected(null);
          }}
        >
          <Grid2X2 size={21} />
          <span>Canvas</span>
        </button>
        <button
          className={panel === 'widgets' ? 'active' : ''}
          title="Your widgets"
          aria-label="Your widgets"
          onClick={() => setPanel('widgets')}
        >
          <Layers3 size={21} />
          <span>Widgets</span>
        </button>
        <button
          className={panel === 'sources' ? 'active' : ''}
          title="Data sources"
          aria-label="Data sources"
          onClick={() => setPanel('sources')}
        >
          <Radio size={21} />
          <span>Sources</span>
        </button>
        <div className="nav-spacer" />
        <button
          title="Connect a screen"
          aria-label="Connect a screen"
          onClick={() => {
            void pair();
          }}
        >
          <Monitor size={21} />
          <span>Screens</span>
        </button>
        <button
          title="How NoticeTV works"
          aria-label="How NoticeTV works"
          onClick={() => setModal('help')}
        >
          <CircleHelp size={20} />
          <span>Guide</span>
        </button>
        {!demo && (
          <button
            title="Sign out"
            aria-label="Sign out"
            onClick={() => {
              void api('/logout', 'POST', {})
                .then(() => onDisconnect?.())
                .catch((failure) => setError(message(failure)));
            }}
          >
            <LogOut size={18} />
          </button>
        )}
      </nav>
      <div className="editor-workspace">
        <div className="canvas-toolbar">
          <div>
            <span className="tiny-label">YOUR CANVAS</span>
            <h2>{demo ? 'A good place to start.' : 'Make yourself at home.'}</h2>
          </div>
          <div className="canvas-tools">
            <button className="text-button" onClick={() => setModal('preview')}>
              <Eye size={15} /> Preview
            </button>
            <button className="secondary-button" onClick={() => setModal('library')}>
              <Plus size={15} /> Add widget
            </button>
          </div>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={15} />
            </button>
          </div>
        )}
        <div className="canvas-area">
          <div className="canvas-dimension">
            <span>
              <Monitor size={12} /> LIVING ROOM DISPLAY
            </span>
            <span>
              16:9 <span className="dimension-dot">·</span> AUTO FIT
            </span>
          </div>
          <div className="canvas-frame">
            {!loaded ? (
              <div className="canvas-loading">
                <LoaderCircle className="spin" />
                {error ? 'The dashboard could not be loaded.' : 'Opening your dashboard…'}
                {error && (
                  <button className="secondary-button" onClick={() => location.reload()}>
                    Try again
                  </button>
                )}
              </div>
            ) : (
              <ScaledBoard
                board={board}
                demo={demo}
                selected={selected}
                onSelect={(id) => {
                  setSelected(id);
                  setPanel('settings');
                }}
              />
            )}
          </div>
          <div className="canvas-under">
            <span>
              <span className="canvas-under-dot" /> {board.widgets.length} widgets{' '}
              <span className="dimension-dot">·</span> Click a widget to make it yours
            </span>
            <button
              className="text-button"
              onClick={() => {
                void pair();
              }}
            >
              Connect a screen <ArrowUpRight size={12} />
            </button>
          </div>
        </div>
        <div className="editor-bottom">
          <span>GOOD DESIGN LEAVES A LITTLE ROOM TO BREATHE.</span>
          <span>
            {demo
              ? 'Fictional data. Real possibilities.'
              : 'Your published screen stays put while you edit.'}
          </span>
        </div>
      </div>
      <aside className="inspector" aria-label="Dashboard settings">
        {panel === 'widgets' ? (
          <>
            <div className="inspector-heading">
              <span className="tiny-label">THE PIECES OF YOUR DAY</span>
              <h2>Your widgets</h2>
              <p>Drag to reorder, or use the arrows in settings.</p>
            </div>
            <div className="widget-list">
              {board.widgets.map((entry, index) => {
                const item = catalog.find((candidate) => candidate.type === entry.type)!;
                const Icon = item.icon;
                return (
                  <button
                    key={entry.id}
                    draggable
                    onDragStart={() => setDragged(entry.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragged) moveWidget(dragged, index);
                      setDragged(null);
                    }}
                    onDragEnd={() => setDragged(null)}
                    onClick={() => {
                      setSelected(entry.id);
                      setPanel('settings');
                    }}
                  >
                    <span className={`catalog-icon ${item.color}`}>
                      <Icon size={17} />
                    </span>
                    <span>
                      {entry.title}
                      <small>
                        {item.title} · {entry.width} × {entry.height}
                      </small>
                    </span>
                    <Settings2 size={13} />
                  </button>
                );
              })}
              <button className="widget-list-add" onClick={() => setModal('library')}>
                <Plus size={16} /> Add a widget
              </button>
            </div>
          </>
        ) : panel === 'sources' ? (
          <>
            <div className="inspector-heading">
              <span className="tiny-label">WHERE IT COMES FROM</span>
              <h2>Your sources</h2>
              <p>Every connection has a place.</p>
            </div>
            <div className="source-list">
              {board.widgets
                .filter(
                  (entry) =>
                    entry.type === 'weather' || entry.type === 'video' || entry.type === 'agenda',
                )
                .map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setSelected(entry.id);
                      setPanel('settings');
                    }}
                  >
                    <span className="source-icon">
                      {entry.type === 'video' ? (
                        <Radio size={19} />
                      ) : entry.type === 'weather' ? (
                        <CloudDrawing />
                      ) : (
                        <Layers3 size={19} />
                      )}
                    </span>
                    <span>
                      {entry.title}
                      <small>
                        {entry.type === 'weather'
                          ? entry.latitude === null
                            ? 'Choose a location'
                            : 'Open-Meteo'
                          : entry.type === 'video'
                            ? entry.url
                              ? 'HLS stream configured'
                              : 'Add a stream URL'
                            : 'Events entered in NoticeTV'}
                      </small>
                    </span>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              <div className="source-info">
                <ShieldCheck size={20} />
                <p>
                  Weather and streams load directly on each screen. Each screen needs access to its
                  sources.
                </p>
              </div>
            </div>
          </>
        ) : widget ? (
          <WidgetInspector
            key={widget.id}
            widget={widget}
            index={board.widgets.findIndex((entry) => entry.id === widget.id)}
            total={board.widgets.length}
            change={changeWidget}
            remove={() => {
              setBoard((old) => ({
                ...old,
                widgets: old.widgets.filter((entry) => entry.id !== widget.id),
              }));
              setSelected(null);
            }}
            move={(offset) =>
              moveWidget(
                widget.id,
                board.widgets.findIndex((entry) => entry.id === widget.id) + offset,
              )
            }
            close={() => setSelected(null)}
          />
        ) : (
          <BoardInspector
            key={loaded ? 'loaded' : 'loading'}
            board={board}
            change={setBoard}
            onImport={() => fileRef.current?.click()}
            onExport={exportFile}
          />
        )}
      </aside>
      <input
        ref={fileRef}
        hidden
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          void importFile(event.target.files?.[0]);
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={16} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <X size={13} />
          </button>
        </div>
      )}
      {modal === 'reconnect' && (
        <Modal
          title="Reconnect your editor."
          eyebrow="YOUR SESSION ENDED"
          close={() => setModal(null)}
        >
          <p className="modal-intro">
            Enter your editor key to continue saving the draft on this page.
          </p>
          <AccessForm
            onConnect={() => {
              setModal(null);
              setToast('Editor reconnected. Your draft is ready to save.');
            }}
          />
        </Modal>
      )}
      {modal === 'library' && (
        <Modal
          title="Make room for more."
          eyebrow="THE WIDGET COLLECTION"
          close={() => setModal(null)}
          wide
        >
          <p className="modal-intro">A few considered pieces. A dashboard that feels like you.</p>
          <div className="widget-catalog">
            {catalog.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.type} onClick={() => addWidget(item.type)}>
                  <div className="catalog-card-top">
                    <span className={`catalog-icon ${item.color}`}>
                      <Icon size={24} strokeWidth={1.4} />
                    </span>
                    <Plus size={15} />
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <span className="catalog-source">
                    {item.source} <ArrowUpRight size={10} />
                  </span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
      {modal === 'pair' && (
        <Modal
          title="A home on the big screen."
          eyebrow="CONNECT A SCREEN"
          close={() => setModal(null)}
        >
          <p className="modal-intro">
            Open this address on your TV’s browser, then enter the pairing code.
          </p>
          <div className="pair-address">{location.origin}/display</div>
          <div className="pair-code" role="group" aria-label="Pairing code">
            {pairing ? (
              pairing.code.split('').map((digit, index) => <span key={index}>{digit}</span>)
            ) : (
              <LoaderCircle className="spin" />
            )}
          </div>
          <p className="pair-expiry">
            {pairing
              ? `This code works once and expires at ${new Date(pairing.expires).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
              : 'Creating your pairing code…'}
          </p>
          <div className="pair-explanation">
            <Monitor size={18} />
            <p>Paired screens show your published dashboard. Editing stays in your workspace.</p>
          </div>
          <button
            className="secondary-button copy-address"
            onClick={() => {
              if (!navigator.clipboard) {
                setToast('Copy the screen address shown above.');
                return;
              }
              void navigator.clipboard
                .writeText(`${location.origin}/display`)
                .then(() => setCopied(true))
                .catch(() => setToast('Copy the screen address shown above.'));
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Address copied' : 'Copy screen address'}
          </button>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
      {modal === 'preview' && (
        <Modal
          title="The view from here."
          eyebrow="DISPLAY PREVIEW"
          close={() => setModal(null)}
          fullscreen
        >
          <div className="preview-board">
            <ScaledBoard board={board} demo={demo} passive />
          </div>
          <p className="preview-caption">
            This is your current draft. Publish when you’re ready to put it on screen.
          </p>
        </Modal>
      )}
      {modal === 'help' && (
        <Modal
          title="A little orientation."
          eyebrow="WELCOME TO NOTICETV"
          close={() => setModal(null)}
        >
          <div className="guide-steps">
            <div>
              <span>01</span>
              <p>
                <strong>Make it yours.</strong> Choose a widget on the canvas to connect its source
                and adjust its size.
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>Take a look.</strong> Preview the whole dashboard. Save a draft to keep
                working later.
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>Bring it to the room.</strong> Publish, then connect a screen with a pairing
                code. It picks up future publications automatically.
              </p>
            </div>
          </div>
          <p className="keyboard-tip">
            <kbd>⌘ / Ctrl</kbd> + <kbd>S</kbd> saves your draft.
          </p>
        </Modal>
      )}
      {modal === 'demo' && (
        <Modal
          title="Make the view your own."
          eyebrow="YOU’RE EXPLORING THE DEMO"
          close={() => setModal(null)}
        >
          <p className="modal-intro">
            The demo uses fictional data. Open your editor to connect real sources, save your
            dashboard, and pair a screen.
          </p>
          <a className="primary-button" href="/">
            Open your editor <ArrowRight size={15} />
          </a>
          <button className="text-button demo-export" onClick={exportFile}>
            <Download size={13} /> Export this layout
          </button>
        </Modal>
      )}
    </main>
  );
}
