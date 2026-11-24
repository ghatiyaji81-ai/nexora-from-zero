/**
 * NEXORA Micro-Feedback & Safe Actions
 * Provides instant tactile feedback for save, copy, and send,
 * and safe undo wrappers for destructive actions (delete, move).
 *
 * Rules:
 * - Success toasts only fire after real completion.
 * - Handles clipboard permission errors gracefully.
 * - Provides rollback on failure.
 */

import { showMicroFeedback, showToast, showUndoToast } from './toast-manager';

export async function copyTextWithFeedback(
  text: string,
  label = 'Content'
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showMicroFeedback(`${label} copied to clipboard`, 'success');
      return true;
    } else {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.setAttribute('aria-hidden', 'true');
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (success) {
        showMicroFeedback(`${label} copied to clipboard`, 'success');
        return true;
      }
      throw new Error('Copy command failed');
    }
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error && err.name === 'NotAllowedError'
        ? `Clipboard permission denied for ${label}`
        : `Could not copy ${label}`;
    showToast({
      message: errorMsg,
      detail: 'Please copy manually or allow clipboard access',
      type: 'info',
      durationMs: 4000,
    });
    return false;
  }
}

export async function saveWithFeedback(
  label = 'Changes',
  action?: () => void | Promise<void>,
  rollback?: () => void
): Promise<boolean> {
  try {
    if (action) {
      await action();
    }
    showMicroFeedback(`${label} saved`, 'success');
    return true;
  } catch (err: unknown) {
    if (rollback) {
      try {
        rollback();
      } catch {}
    }
    showToast({
      message: `Failed to save ${label}`,
      detail: err instanceof Error ? err.message : 'Please try again',
      type: 'info',
      durationMs: 4500,
    });
    return false;
  }
}

export async function sendWithFeedback(
  label = 'Message',
  action?: () => void | Promise<void>,
  rollback?: () => void
): Promise<boolean> {
  try {
    if (action) {
      await action();
    }
    showMicroFeedback(`${label} sent`, 'success');
    return true;
  } catch (err: unknown) {
    if (rollback) {
      try {
        rollback();
      } catch {}
    }
    showToast({
      message: `Failed to send ${label}`,
      detail: err instanceof Error ? err.message : 'Check connection and retry',
      type: 'info',
      durationMs: 4500,
    });
    return false;
  }
}

export function deleteWithUndo(
  itemLabel: string,
  onDelete: () => void,
  onUndo: () => void
): void {
  onDelete();
  showUndoToast(`Deleted ${itemLabel}`, onUndo, {
    detail: 'Press ⌘Z to undo within 10s',
    durationMs: 10000,
  });
}

export function moveWithUndo(
  itemLabel: string,
  destination: string,
  onMove: () => void,
  onUndo: () => void
): void {
  onMove();
  showUndoToast(`Moved ${itemLabel} to ${destination}`, onUndo, {
    detail: 'Press ⌘Z to undo within 10s',
    durationMs: 10000,
  });
}
