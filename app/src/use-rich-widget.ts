import { useEffect, useMemo, useState } from 'react';
import type { Dashboard } from '../shared/dashboard';
import { widgetEntityIds, type RichWidget, type RichWidgetData } from '../shared/rich-widgets';
import { richPreview } from '../shared/rich-demo';
import { api, errorMessage } from './api';

export function useRichWidget(
  widget: RichWidget,
  board: Dashboard,
  demo: boolean,
  published: boolean,
) {
  const { title: _title, width: _width, height: _height, ...configuration } = widget;
  const key = JSON.stringify(
    published
      ? { id: widget.id, published }
      : { configuration, timeZone: board.timeZone, units: board.units },
  );
  const [result, setResult] = useState<{ key: string; data: RichWidgetData | null; error: string }>(
    { key, data: null, error: '' },
  );
  const preview = useMemo(
    () => (demo ? richPreview(widget, new Date(), board.units) : null),
    [demo, key],
  );
  const configured = widgetEntityIds(widget).length > 0;
  useEffect(() => {
    if (demo || !configured) return;
    let retired = false,
      running = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const update = async () => {
      if (retired || running) return;
      clearTimeout(timer);
      if (!document.hidden) {
        running = true;
        try {
          const data = published
            ? await api<RichWidgetData>(
                `/home-assistant/widgets/${widget.id}/data`,
                'GET',
                undefined,
                controller.signal,
              )
            : await api<RichWidgetData>(
                '/home-assistant/widget-preview',
                'POST',
                { widget, timeZone: board.timeZone, units: board.units },
                controller.signal,
              );
          if (!retired) setResult({ key, data, error: '' });
        } catch (failure) {
          if (!retired)
            setResult((old) => ({
              key,
              data: old.key === key ? old.data : null,
              error: errorMessage(failure),
            }));
        } finally {
          running = false;
        }
      }
      if (!retired) timer = setTimeout(update, 5000);
    };
    void update();
    document.addEventListener('visibilitychange', update);
    window.addEventListener('online', update);
    return () => {
      retired = true;
      clearTimeout(timer);
      controller.abort();
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('online', update);
    };
  }, [key, demo, configured]);
  return demo
    ? { data: preview, error: '', configured: true }
    : {
        data: result.key === key ? result.data : null,
        error: result.key === key ? result.error : '',
        configured,
      };
}
