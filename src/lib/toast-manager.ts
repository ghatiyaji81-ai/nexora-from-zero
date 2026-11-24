/**
 * NEXORA Toast & Undo Notification System
 * Accessible notification queue supporting 10-second undoable actions,
 * micro-feedback, screen-reader announcements, and keyboard control.
 */

export type ToastType = 'info' | 'success' | 'undo' | 'action' | 'error' | 'neutral';

export interface ToastItem {
  id: string;
  message: string;
  detail?: string;
  type: ToastType;
  durationMs: number;
  undoAction?: () => void;
  undoLabel?: string;
  createdAt: number;
}

let activeToasts: ToastItem[] = [];
let nextId = 1;

function notifyToastChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('nexora-toast-change', {
      detail: [...activeToasts],
    })
  );
}

export function getActiveToasts(): ToastItem[] {
  return [...activeToasts];
}

export function showToast(options: {
  message: string;
  detail?: string;
  type?: ToastType;
  durationMs?: number;
  undoAction?: () => void;
  undoLabel?: string;
}): string {
  const id = `toast-${nextId++}-${Date.now()}`;
  const durationMs = options.durationMs ?? (options.undoAction ? 10000 : 3500);

  const toast: ToastItem = {
    id,
    message: options.message,
    detail: options.detail,
    type: options.type ?? (options.undoAction ? 'undo' : 'info'),
    durationMs,
    undoAction: options.undoAction,
    undoLabel: options.undoLabel ?? 'Undo',
    createdAt: Date.now(),
  };

  // Keep max 4 toasts visible at a time
  activeToasts = [toast, ...activeToasts].slice(0, 4);
  notifyToastChange();

  // Auto-dismiss after duration
  if (durationMs > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, durationMs);
  }

  return id;
}

export function showUndoToast(
  message: string,
  onUndo: () => void,
  options?: { detail?: string; durationMs?: number; undoLabel?: string }
): string {
  return showToast({
    message,
    detail: options?.detail,
    type: 'undo',
    durationMs: options?.durationMs ?? 10000, // 10 seconds default for undo
    undoAction: onUndo,
    undoLabel: options?.undoLabel ?? 'Undo',
  });
}

export function showMicroFeedback(
  message: string,
  type: 'success' | 'info' = 'success',
  detail?: string
): string {
  return showToast({
    message,
    detail,
    type,
    durationMs: 3200,
  });
}

export function dismissToast(id: string): void {
  const beforeLength = activeToasts.length;
  activeToasts = activeToasts.filter(t => t.id !== id);
  if (activeToasts.length !== beforeLength) {
    notifyToastChange();
  }
}

export function triggerUndo(id: string): void {
  const toast = activeToasts.find(t => t.id === id);
  if (toast && toast.undoAction) {
    toast.undoAction();
    dismissToast(id);
    showMicroFeedback('Action undone', 'info');
  }
}

export function triggerTopUndo(): boolean {
  const topUndoToast = activeToasts.find(t => Boolean(t.undoAction));
  if (topUndoToast) {
    triggerUndo(topUndoToast.id);
    return true;
  }
  return false;
}

// Global Cmd+Z / Ctrl+Z listener for top undo toast
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => {
    // Only handle if not in an input, textarea, select, contenteditable, or role=textbox
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const tagName = target.tagName.toUpperCase();
    const isInput =
      tagName === 'INPUT' ||
      tagName === 'TEXTAREA' ||
      tagName === 'SELECT' ||
      target.isContentEditable ||
      target.getAttribute('role') === 'textbox';

    if (!isInput && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      const topUndoToast = activeToasts.find(t => Boolean(t.undoAction));
      if (topUndoToast) {
        e.preventDefault();
        triggerUndo(topUndoToast.id);
      }
    }
  });
}

