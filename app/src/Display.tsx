import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { dashboardSchema, type Dashboard as DashboardData } from '../shared/dashboard';
import { api, ApiError, errorMessage as message } from './api';
import { Wordmark, ScaledBoard } from './ui';
import { themeStyle } from './theme';

export function Display({ onDisconnect }: { onDisconnect: () => void }) {
  const [board, setBoard] = useState<DashboardData | null>(null);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState('');
  const version = useRef(-1);
  useEffect(() => {
    let retired = false,
      running = false;
    async function refresh() {
      if (running || retired || document.hidden) return;
      running = true;
      try {
        const result = await api<{ dashboard: DashboardData; version: number }>('/dashboard');
        if (!retired) {
          if (result.version !== version.current) {
            setBoard(dashboardSchema.parse(result.dashboard));
            version.current = result.version;
          }
          setOnline(true);
          setError('');
        }
      } catch (failure) {
        if (retired) return;
        if (failure instanceof ApiError && failure.status === 401) {
          onDisconnect();
          return;
        }
        setOnline(false);
        setError(message(failure));
      } finally {
        running = false;
      }
    }
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 10_000);
    const resume = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      retired = true;
      clearInterval(timer);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [onDisconnect]);
  if (!board)
    return (
      <div className="loading-screen">
        <Wordmark />
        <LoaderCircle size={22} className="spin" />
        <p>{error || 'Bringing your dashboard into view…'}</p>
      </div>
    );
  return (
    <main className="display-view" data-theme={board.theme} style={themeStyle(board.theme)}>
      <ScaledBoard board={board} passive online={online} />
    </main>
  );
}
