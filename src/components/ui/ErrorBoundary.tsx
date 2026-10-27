import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { logInternalDiagnostic } from '../../utils/friendlyErrors';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logInternalDiagnostic('ErrorBoundary::ReactCrash', error, {
      componentStack: errorInfo?.componentStack || '',
    });
  }

  public render() {
    if (this.state.hasError) {
      const isDev = Boolean(import.meta.env.DEV);
      return (
        <div className="min-h-screen bg-brand-neutral dark:bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-slate-800">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-50 dark:bg-red-950/30 text-brand-red rounded-full flex items-center justify-center mx-auto mb-5">
                <AlertTriangle size={32} />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                We couldn't display this page right now
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                An unexpected display issue occurred. Refreshing the page or returning to the dashboard usually resolves this right away.
              </p>
              
              <div className="flex flex-col gap-2.5">
                <button 
                  onClick={() => window.location.reload()}
                  className="w-full py-2.5 px-4 bg-brand-red text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-brand-red/90 transition-colors cursor-pointer"
                >
                  <RefreshCw size={16} />
                  Refresh Page
                </button>
                <a 
                  href="/"
                  className="w-full py-2.5 px-4 bg-gray-100 dark:bg-slate-800 text-brand-slate dark:text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Home size={16} />
                  Return Home
                </a>
              </div>
            </div>
            {isDev && this.state.error && (
              <details className="bg-red-50 dark:bg-red-950/20 p-4 border-t border-red-100 dark:border-red-900/30 text-left">
                <summary className="text-xs font-semibold text-red-600 dark:text-red-400 cursor-pointer">
                  Developer Diagnostics (Development Only)
                </summary>
                <p className="mt-2 text-xs font-mono text-red-600 dark:text-red-400 break-words whitespace-pre-wrap">
                  {this.state.error.toString()}
                </p>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
