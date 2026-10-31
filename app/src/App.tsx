import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { api, errorMessage as message, type Role } from './api';
import { Editor } from './Editor';
import { Login } from './Login';
import { Display } from './Display';
import { Wordmark } from './ui';

export function App() {
  const demo = location.pathname === '/demo';
  const display = location.pathname === '/display';
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState('');
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    api<{ role: Role }>('/session')
      .then((data) => {
        if (!controller.signal.aborted) setRole(data.role);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(message(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [demo]);
  if (loading)
    return (
      <div className="loading-screen">
        <Wordmark />
        <LoaderCircle className="spin" size={22} />
      </div>
    );
  if (demo) return <Editor demo />;
  if (!role) return <Login display={display} onConnect={setRole} initialError={error} />;
  if (display || role === 'display') return <Display onDisconnect={() => setRole(null)} />;
  return <Editor onDisconnect={() => setRole(null)} />;
}
