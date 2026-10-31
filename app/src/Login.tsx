import { useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, LoaderCircle } from 'lucide-react';
import { api, errorMessage as message, type Role } from './api';
import { Wordmark, CloudDrawing } from './ui';

export function Login({
  display = false,
  onConnect,
  initialError = '',
}: {
  display?: boolean;
  onConnect: (role: Role) => void;
  initialError?: string;
}) {
  return (
    <main className="welcome">
      <div className="welcome-nav">
        <Wordmark />
        <a href="/demo">
          Explore the demo <ArrowUpRight size={14} />
        </a>
      </div>
      <div className="welcome-content">
        <span className="welcome-eyebrow">
          <span className="sun-mark">✳</span> A LITTLE MORE IN VIEW
        </span>
        <h1>
          {display ? (
            <>
              A good place
              <br />
              to look up.
            </>
          ) : (
            <>
              Your world.
              <br />A little closer.
            </>
          )}
        </h1>
        <p>
          {display
            ? 'Connect this screen to your NoticeTV dashboard.'
            : 'The day ahead. The weather outside. A window to somewhere. Make a home for what matters.'}
        </p>
        <AccessForm display={display} onConnect={onConnect} initialError={initialError} />
        <p className="welcome-help">
          {display ? (
            <>
              In your editor, choose <strong>Connect a screen</strong> to get a pairing code.
            </>
          ) : (
            <>
              Get your key from the server with <code>npm run access-key</code>.
            </>
          )}
        </p>
      </div>
      <div className="welcome-art" aria-hidden="true">
        <div className="welcome-orbit" />
        <div className="welcome-orbit second" />
        <div className="welcome-mini weather-mini">
          <CloudDrawing />
          <span>THE WORLD OUTSIDE</span>
          <strong>64°</strong>
          <small>A little sun. A little perspective.</small>
        </div>
        <div className="welcome-mini note-mini">
          <span>A THOUGHT FOR TODAY</span>
          <strong>
            Less scrolling.
            <br />
            More looking up.
          </strong>
          <i>✳</i>
        </div>
        <div className="welcome-mini day-mini">
          <span>ONE DAY AT A TIME</span>
          <strong>Here. Now.</strong>
          <small>Make a little space for the everyday.</small>
        </div>
      </div>
      <footer className="welcome-footer">
        <span>DESIGNED FOR LIFE IN THE ROOM.</span>
        <span>Self-hosted. Open source. Yours.</span>
      </footer>
    </main>
  );
}

export function AccessForm({
  display = false,
  onConnect,
  initialError = '',
}: {
  display?: boolean;
  onConnect: (role: Role) => void;
  initialError?: string;
}) {
  const [key, setKey] = useState('');
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api<{ role: Role }>(
        display ? '/pair' : '/login',
        'POST',
        display ? { code: key } : { key },
      );
      onConnect(data.role);
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="connect-form"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <label className="field">
        <span>
          {display ? 'Pairing code' : 'Editor key'} <span aria-hidden="true">*</span>
        </span>
        <input
          aria-label={display ? 'Pairing code' : 'Editor key'}
          type={display ? 'text' : 'password'}
          inputMode={display ? 'numeric' : 'text'}
          autoComplete={display ? 'one-time-code' : 'current-password'}
          value={key}
          maxLength={256}
          required
          onChange={(event) => setKey(event.target.value)}
          placeholder={display ? 'Six-digit code' : 'Enter your editor key'}
        />
      </label>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={busy || !key.trim()}>
        {busy ? <LoaderCircle size={15} className="spin" /> : null}
        {display ? 'Connect screen' : 'Open your editor'}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
