import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Keep lightweight diagnostics in dev console without leaking secrets
    console.error('[DevReady Studio] UI error boundary caught:', error);
  }

  private handleReload = () => {
    window.location.hash = '';
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      indexedDB.deleteDatabase('devready-studio-db');
      localStorage.removeItem('devready:recents');
      localStorage.removeItem('devready:pinned');
    } catch {
      // ignore storage errors
    }
    this.handleReload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="eb-shell">
        <div className="eb-card">
          <div className="eb-ic">
            <AlertTriangle size={22} />
          </div>
          <h1>Something went wrong</h1>
          <p>
            DevReady Studio encountered an unexpected rendering error. Your Figma files are safe.
          </p>
          <pre className="eb-msg mono">{this.state.error.message || 'Unknown error'}</pre>
          <div className="eb-actions">
            <button type="button" className="fig-btn-primary" onClick={this.handleReload}>
              <RefreshCw size={13} />
              <span>Reload Studio</span>
            </button>
            <button type="button" className="fig-btn-ghost" onClick={this.handleResetCache}>
              <RotateCcw size={13} />
              <span>Reset local cache</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
