import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './uiux-pro-max.css';

interface RootErrorBoundaryProps {
  children: ReactNode;
}

interface RootErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Root-level Error Boundary for catching and displaying any module or rendering
 * crash on initial load before it causes a blank screen.
 */
class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  public state: RootErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<RootErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RootErrorBoundary] Uncaught application error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      sessionStorage.clear();
      localStorage.removeItem('jaystar_cached_user_role');
      localStorage.removeItem('jaystar_cached_user_id');
      localStorage.removeItem('jaystar_cached_student_doc_id');
    } catch {
      // ignore
    }
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 font-sans">
          <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center font-black text-lg">
                !
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Application Initialisation Error</h1>
                <p className="text-xs text-slate-400">A runtime module or rendering failure prevented initial display.</p>
              </div>
            </div>

            <div className="bg-red-950/40 border border-red-900/60 rounded-xl p-4 text-xs font-mono text-red-300 break-words whitespace-pre-wrap max-h-56 overflow-y-auto">
              <p className="font-bold mb-1">{this.state.error?.name || 'Error'}: {this.state.error?.message || 'Unknown error occurred'}</p>
              {this.state.error?.stack && (
                <div className="text-[11px] text-slate-400 mt-2 border-t border-red-900/40 pt-2 font-mono">
                  {this.state.error.stack}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer text-center"
              >
                Reload Preview
              </button>
              <button
                type="button"
                onClick={this.handleResetCache}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Clear Cache & Return Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Window-level safety interceptors
window.addEventListener('error', (event) => {
  console.error('[Global Error Listener]', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global Unhandled Rejection]', event.reason);
});

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>,
  );
} else {
  console.error('Fatal: #root element not found in DOM.');
}
