import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Mobile Polish, Bottom Navigation & Touch Accessibility (WCAG 2.5.1 / 2.5.5)', () => {
  it('verifies CSS rules enforce min 44px touch targets on mobile (WCAG 2.5.5)', () => {
    const cssPath = path.resolve(process.cwd(), 'src/app/globals.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // Verify 44px min-width and min-height in mobile media query
    assert.ok(cssContent.includes('min-height: 44px'), 'CSS must declare min-height: 44px for touch targets');
    assert.ok(cssContent.includes('min-width: 44px'), 'CSS must declare min-width: 44px for touch targets');
    assert.ok(cssContent.includes('100dvh'), 'CSS must support 100dvh for dynamic mobile viewports');
    assert.ok(cssContent.includes('env(safe-area-inset-bottom)'), 'CSS must respect iOS/Android safe area insets');
  });

  it('verifies touch devices disable sticky hover effects (@media hover: none)', () => {
    const cssPath = path.resolve(process.cwd(), 'src/app/globals.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(
      cssContent.includes('@media (hover: none) and (pointer: coarse)'),
      'CSS must isolate touch hover effects from fine-pointer mice'
    );
  });

  it('verifies Mobile Navigation Bar structure: max 5 items + More, Cmd+K trigger, and Focus integration', () => {
    const navPath = path.resolve(process.cwd(), 'src/components/mobile-nav.tsx');
    assert.ok(fs.existsSync(navPath), 'src/components/mobile-nav.tsx must exist');

    const navContent = fs.readFileSync(navPath, 'utf8');

    // Verify 5 primary items + More
    assert.ok(navContent.includes('Overview'), 'Mobile nav must include Overview');
    assert.ok(navContent.includes('Focus'), 'Mobile nav must include Focus');
    assert.ok(navContent.includes('Connect'), 'Mobile nav must include Connect');
    assert.ok(navContent.includes('Think'), 'Mobile nav must include Think');
    assert.ok(navContent.includes('Search'), 'Mobile nav must include Search (Cmd+K)');
    assert.ok(navContent.includes('More'), 'Mobile nav must include More drawer');

    // Verify Cmd+K trigger event
    assert.ok(navContent.includes('nexora-open-palette'), 'Mobile nav search button must trigger command palette');

    // Verify Distraction Shield integration
    assert.ok(navContent.includes('isPathShielded'), 'Mobile nav must check shielded paths during active focus');
    assert.ok(navContent.includes('nexora-shield-alert'), 'Mobile nav must alert on shielded path attempts');
  });

  it('verifies Pull-to-Refresh enforces local-only refresh and overscroll containment', () => {
    const ptrPath = path.resolve(process.cwd(), 'src/components/pull-to-refresh.tsx');
    assert.ok(fs.existsSync(ptrPath), 'src/components/pull-to-refresh.tsx must exist');

    const ptrContent = fs.readFileSync(ptrPath, 'utf8');

    // Verify overscroll behavior
    assert.ok(ptrContent.includes('overscrollBehaviorY: \'contain\''), 'Must use overscroll-behavior-y: contain');

    // Verify honest local data refresh only (no fake external network calls)
    assert.ok(ptrContent.includes('nexora-timeline-change'), 'Must trigger local timeline refresh');
    assert.ok(ptrContent.includes('nexora-focus-change'), 'Must trigger local focus refresh');
    assert.ok(ptrContent.includes('Local data refreshed'), 'Must state honestly that local data was refreshed');
  });

  it('verifies Haptic Feedback utility respects reduced-motion preferences and browser capability', () => {
    const hapticsPath = path.resolve(process.cwd(), 'src/lib/haptics.ts');
    assert.ok(fs.existsSync(hapticsPath), 'src/lib/haptics.ts must exist');

    const hapticsContent = fs.readFileSync(hapticsPath, 'utf8');

    // Must check for navigator.vibrate
    assert.ok(hapticsContent.includes('vibrate'), 'Must check for navigator.vibrate');

    // Must check prefers-reduced-motion
    assert.ok(
      hapticsContent.includes('prefers-reduced-motion') || hapticsContent.includes('data-motion-mode'),
      'Must check reduced-motion preferences before vibrating'
    );
  });

  it('verifies SwipableItem handles swipe gestures with edge-swipe protection and visible button alternatives', () => {
    const swipePath = path.resolve(process.cwd(), 'src/components/swipable-item.tsx');
    assert.ok(fs.existsSync(swipePath), 'src/components/swipable-item.tsx must exist');

    const content = fs.readFileSync(swipePath, 'utf8');
    assert.ok(content.includes('isEdge'), 'Must detect and ignore screen edge touch starts to avoid back-swipe clash');
    assert.ok(content.includes('onSwipeArchive'), 'Must support archive swipe gesture');
    assert.ok(content.includes('onSwipeSnooze'), 'Must support snooze swipe gesture');
    assert.ok(content.includes('Math.abs(deltaY) > Math.abs(deltaX)'), 'Must ignore predominantly vertical scroll gestures');

    const commPath = path.resolve(process.cwd(), 'src/components/communication-relief.tsx');
    const commContent = fs.readFileSync(commPath, 'utf8');
    assert.ok(commContent.includes('SwipableItem'), 'Communication Relief must wrap items in SwipableItem');
    assert.ok(commContent.includes('comm-dismiss-btn'), 'Must retain visible dismiss button alternative');
    assert.ok(commContent.includes('Snooze 3h'), 'Must retain visible snooze button alternative');
  });

  it('verifies PreviewLink disables hover preview popups on touch interactions', () => {
    const previewPath = path.resolve(process.cwd(), 'src/components/preview-link.tsx');
    assert.ok(fs.existsSync(previewPath), 'src/components/preview-link.tsx must exist');

    const content = fs.readFileSync(previewPath, 'utf8');
    assert.ok(content.includes('onTouchStart'), 'Must handle touchstart to disable preview popup on touch');
    assert.ok(content.includes('isTouchDevice'), 'Must detect touch devices and suppress mouseenter previews');
  });
});
