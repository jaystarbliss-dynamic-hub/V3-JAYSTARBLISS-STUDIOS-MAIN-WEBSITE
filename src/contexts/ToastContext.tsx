/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

import { getFriendlyErrorMessage, logInternalDiagnostic } from '../utils/friendlyErrors';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export interface ToastFn {
  (message: string, type?: ToastType): void;
  success: (message: string) => void;
  error: (messageOrError: unknown, fallback?: string) => void;
  info: (message: string) => void;
}

interface ToastContextType {
  toast: ToastFn;
  success: (message: string) => void;
  error: (messageOrError: unknown, fallback?: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const success = useCallback((message: string) => addToast(message, 'success'), [addToast]);
  const error = useCallback((messageOrError: unknown, fallback?: string) => {
    const friendly = typeof messageOrError === 'string' && !messageOrError.includes('FirebaseError') && !messageOrError.includes('HTTP ')
      ? messageOrError
      : getFriendlyErrorMessage(messageOrError, fallback);
    
    if (messageOrError && (messageOrError instanceof Error || typeof messageOrError === 'object')) {
      logInternalDiagnostic('Toast::Error', messageOrError);
    }
    addToast(friendly, 'error');
  }, [addToast]);
  const info = useCallback((message: string) => addToast(message, 'info'), [addToast]);

  const toastFn = useMemo(() => {
    const fn = (message: string, type: ToastType = 'info') => addToast(message, type);
    fn.success = success;
    fn.error = error;
    fn.info = info;
    return fn as ToastFn;
  }, [addToast, success, error, info]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const contextValue = useMemo(() => ({
    toast: toastFn,
    success,
    error,
    info
  }), [toastFn, success, error, info]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 p-4 rounded-xl shadow-lg border animate-in slide-in-from-bottom-5 fade-in duration-300 min-w-[300px] ${
              toast.type === 'success'
                ? 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-900 text-green-800 dark:text-green-200'
                : toast.type === 'error'
                ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200'
                : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 text-gray-800 dark:text-gray-200'
            }`}
          >
            {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
            {toast.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
            <span className="flex-1 text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

