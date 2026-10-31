import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Details can include private source URLs; keep them out of logs. */
  }
  render() {
    return this.state.failed ? (
      <main className="loading-screen">
        <h1>Let’s bring the view back.</h1>
        <p>Your published dashboard is saved on the server.</p>
        <button className="primary-button" onClick={() => location.reload()}>
          Reload NoticeTV
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
