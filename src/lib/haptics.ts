/**
 * NEXORA Haptics Utility
 * 
 * Respects:
 * 1. User toggle (localStorage 'nexora-haptics')
 * 2. WCAG / OS reduced-motion preferences
 * 3. Browser platform capability (Android Chrome supported; iOS Safari does not support navigator.vibrate)
 */

export function isHapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

export function isHapticsEnabled(): boolean {
  if (!isHapticsSupported()) return false;
  if (typeof window === 'undefined') return false;

  const userPref = localStorage.getItem('nexora-haptics');
  if (userPref === 'false') return false;

  const isReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.dataset.motionMode === 'reduce';
  if (isReducedMotion) return false;

  return true;
}

export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('nexora-haptics', enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('nexora-haptics-change', { detail: { enabled } }));
  }
}

export function triggerHaptic(type: 'tap' | 'success' | 'warn' | 'tick' = 'tap'): void {
  if (!isHapticsEnabled()) return;

  try {
    switch (type) {
      case 'tap':
      case 'tick':
        navigator.vibrate(10);
        break;
      case 'success':
        navigator.vibrate([15, 40, 20]);
        break;
      case 'warn':
        navigator.vibrate([25, 50, 25]);
        break;
    }
  } catch {
    // Graceful fallback
  }
}
