import { useState } from 'react';
import { CalendarDays, Camera, CloudSun, HeartPulse, ShieldCheck, Thermometer } from 'lucide-react';
import type { Dashboard } from '../shared/dashboard';
import type { RichWidget, CalendarEvent } from '../shared/rich-widgets';
import { useRichWidget } from './use-rich-widget';
import { HomeWeather } from './rich/Weather';
import { Climate, Readiness, HomeStatus } from './rich/Sensors';
import { ConnectedAgenda, EventDialog } from './rich/Calendar';
import { CameraSnapshot } from './rich/Camera';
import { Empty, SourceFooter } from './rich/ui';

export function RichWidgetView({
  widget,
  dashboard,
  now,
  demo,
  passive,
  published,
}: {
  widget: RichWidget;
  dashboard: Dashboard;
  now: Date;
  demo: boolean;
  passive: boolean;
  published: boolean;
}) {
  const { data, error, configured } = useRichWidget(widget, dashboard, demo, published);
  const [expanded, setExpanded] = useState<CalendarEvent | null>(null);
  return (
    <div className={`rich-widget rich-${widget.type}`}>
      <div className="rich-heading">
        <span className="tiny-label">{widget.title}</span>
        {widget.type === 'ha-weather' ? (
          <CloudSun size={15} />
        ) : widget.type === 'ha-agenda' ? (
          <CalendarDays size={15} />
        ) : widget.type === 'ha-climate' ? (
          <Thermometer size={15} />
        ) : widget.type === 'ha-readiness' ? (
          <HeartPulse size={15} />
        ) : widget.type === 'ha-status' ? (
          <ShieldCheck size={15} />
        ) : (
          <Camera size={15} />
        )}
      </div>
      {!configured ? (
        <Empty
          title="Make the connection."
          detail="Choose Home Assistant entities in this widget’s settings."
        />
      ) : !data ? (
        <Empty
          title={error ? 'Waiting for your home.' : 'Bringing your home into view.'}
          detail={error || 'Reading your sources from Home Assistant.'}
        />
      ) : (
        <>
          {data.type === 'ha-weather' && (
            <HomeWeather value={data.data} board={dashboard} now={now} />
          )}
          {data.type === 'ha-agenda' && widget.type === 'ha-agenda' && (
            <ConnectedAgenda
              value={data.data}
              widget={widget}
              board={dashboard}
              now={now}
              passive={passive}
              unavailable={data.stale && data.warnings.length > 0}
              open={setExpanded}
            />
          )}
          {data.type === 'ha-climate' && <Climate value={data.data} />}
          {data.type === 'ha-readiness' && <Readiness value={data.data} />}
          {data.type === 'ha-status' && <HomeStatus value={data.data} />}
          {data.type === 'ha-camera' &&
            widget.type === 'ha-camera' &&
            (data.phase === 'not_configured' && !demo ? (
              <Empty
                title="Connect your camera."
                detail="Connect Home Assistant in Sources to load snapshots."
              />
            ) : (
              <CameraSnapshot
                widget={widget}
                board={dashboard}
                demo={demo}
                published={published}
                motion={data.data.motion}
                passive={passive}
                staleData={!!error || data.stale || data.phase !== 'connected'}
              />
            ))}
          <SourceFooter value={data} offline={!!error} demo={demo} zone={dashboard.timeZone} />
        </>
      )}
      {expanded && (
        <EventDialog event={expanded} board={dashboard} close={() => setExpanded(null)} />
      )}
    </div>
  );
}
