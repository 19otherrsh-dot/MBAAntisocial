'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './ui.module.css';

type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  variant: ToastVariant;
  title: string;
  body?: string;
}

interface ToastApi {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Feedback for actions whose result is not visible in the page itself. */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within <ToastProvider>');
  return context;
}

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: styles.toastSuccess,
  error: styles.toastError,
  info: styles.toastInfo,
};

const VARIANT_ICON: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 size={17} />,
  error: <AlertTriangle size={17} />,
  info: <Info size={17} />,
};

const DURATION: Record<ToastVariant, number> = {
  // Errors linger; they usually carry something the user has to read.
  success: 3500,
  info: 4000,
  error: 6500,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, title: string, body?: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, variant, title, body }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION[variant])
      );
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, body) => push('success', title, body),
      error: (title, body) => push('error', title, body),
      info: (title, body) => push('info', title, body),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Polite live region: announced without interrupting the current task. */}
      <div className={styles.toastViewport} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={cn(styles.toast, VARIANT_CLASS[toast.variant])}>
            <span className={styles.toastIcon}>{VARIANT_ICON[toast.variant]}</span>
            <div className={styles.toastText}>
              <div className={styles.toastTitle}>{toast.title}</div>
              {toast.body && <div className={styles.toastBody}>{toast.body}</div>}
            </div>
            <button
              className={styles.toastDismiss}
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
