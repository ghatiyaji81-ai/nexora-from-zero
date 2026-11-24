import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatFocusTime,
  getSpaceLabel,
  isSpaceAllowed,
  startFocusSession,
  startBreakSession,
  pauseFocusSession,
  resumeFocusSession,
  stopFocusSession,
  toggleDistractionShield,
  grantTemporaryPass,
  isNotificationMuted,
  getGentleStreakData,
  FocusSessionState,
} from '../src/lib/focus-manager';
import {
  getAmbientState,
  setAmbientVolume,
  toggleAmbientMute,
  stopAmbientSound,
} from '../src/lib/ambient-sound';

describe('Focus Session & Distraction Shield', () => {
  it('formats time in mm:ss format accurately', () => {
    assert.equal(formatFocusTime(1500), '25:00');
    assert.equal(formatFocusTime(65), '01:05');
    assert.equal(formatFocusTime(9), '00:09');
    assert.equal(formatFocusTime(0), '00:00');
  });

  it('resolves correct readable space labels for routes', () => {
    assert.equal(getSpaceLabel('/'), 'Overview');
    assert.equal(getSpaceLabel('/#focus'), 'Focus Room');
    assert.equal(getSpaceLabel('/build'), 'Build');
    assert.equal(getSpaceLabel('/think'), 'Think');
    assert.equal(getSpaceLabel('/connect'), 'Connect');
    assert.equal(getSpaceLabel('/speak'), 'Speak');
    assert.equal(getSpaceLabel('/create'), 'Create');
    assert.equal(getSpaceLabel('/discover'), 'Discover');
    assert.equal(getSpaceLabel('/social'), 'Social');
  });

  it('initializes a focus session and mutes notifications', () => {
    const session = startFocusSession('/build', 25 * 60, true);
    assert.equal(session.isActive, true);
    assert.equal(session.isPaused, false);
    assert.equal(session.chosenSpace, '/build');
    assert.equal(session.chosenSpaceLabel, 'Build');
    assert.equal(session.notificationsMuted, true);
    assert.equal(session.distractionShieldEnabled, true);
    assert.equal(isNotificationMuted(), true);
  });

  it('permits system paths and chosen focus workspace while shielding others', () => {
    const session = startFocusSession('/build', 25 * 60, true);

    // Allowed paths
    assert.equal(isSpaceAllowed('/', session), true);
    assert.equal(isSpaceAllowed('/login', session), true);
    assert.equal(isSpaceAllowed('/api/build/projects', session), true);
    assert.equal(isSpaceAllowed('/build', session), true);
    assert.equal(isSpaceAllowed('/build/my-project', session), true);

    // Shielded paths
    assert.equal(isSpaceAllowed('/social', session), false);
    assert.equal(isSpaceAllowed('/connect', session), false);
    assert.equal(isSpaceAllowed('/think', session), false);
  });

  it('allows all paths when distraction shield is toggled off', () => {
    startFocusSession('/build', 25 * 60, true);
    toggleDistractionShield(); // Turn OFF
    assert.equal(isSpaceAllowed('/social'), true);
    assert.equal(isSpaceAllowed('/connect'), true);
  });

  it('allows temporary pass for a shielded space', () => {
    const session = startFocusSession('/build', 25 * 60, true);
    assert.equal(isSpaceAllowed('/social', session), false);

    const updated = grantTemporaryPass('/social');
    assert.equal(isSpaceAllowed('/social', updated), true);
    // Other spaces still shielded
    assert.equal(isSpaceAllowed('/connect', updated), false);
  });

  it('pauses, resumes, and stops a session properly', () => {
    startFocusSession('/think', 25 * 60, true);

    const paused = pauseFocusSession();
    assert.equal(paused.isPaused, true);
    assert.equal(paused.isActive, true);

    const resumed = resumeFocusSession();
    assert.equal(resumed.isPaused, false);
    assert.equal(resumed.isActive, true);

    const stopped = stopFocusSession();
    assert.equal(stopped.isActive, false);
    assert.equal(stopped.notificationsMuted, false);
    assert.equal(isNotificationMuted(), false);
    assert.equal(isSpaceAllowed('/social', stopped), true);
  });

  it('initializes a 5-minute break session without distraction shielding', () => {
    const breakSession = startBreakSession(5);
    assert.equal(breakSession.isActive, true);
    assert.equal(breakSession.isBreakMode, true);
    assert.equal(breakSession.remainingSeconds, 300);
    assert.equal(breakSession.distractionShieldEnabled, false);
    // In break mode, all spaces are accessible
    assert.equal(isSpaceAllowed('/social', breakSession), true);
    stopFocusSession();
  });

  it('returns positive, guilt-free gentle streak messaging', () => {
    const streak = getGentleStreakData();
    assert.ok(typeof streak.message === 'string');
    assert.ok(streak.message.length > 0);
    assert.equal(typeof streak.todayCount, 'number');
    assert.equal(typeof streak.weekCount, 'number');
    // Ensure no guilt-based words appear
    const lower = streak.message.toLowerCase();
    assert.ok(!lower.includes('failed'));
    assert.ok(!lower.includes('lost'));
    assert.ok(!lower.includes('broken'));
    assert.ok(!lower.includes('shame'));
  });

  it('ambient sound is off by default (never autoplays) and supports volume & mute', () => {
    const initial = getAmbientState();
    assert.equal(initial.currentSound, 'off');
    assert.equal(initial.isPlaying, false);

    // Volume bounding
    setAmbientVolume(0.8);
    assert.equal(getAmbientState().volume, 0.8);
    setAmbientVolume(1.5); // over 1 -> clamped to 1
    assert.equal(getAmbientState().volume, 1.0);
    setAmbientVolume(-0.2); // under 0 -> clamped to 0
    assert.equal(getAmbientState().volume, 0.0);

    // Mute toggle
    const isMuted = toggleAmbientMute();
    assert.equal(getAmbientState().isMuted, isMuted);
    toggleAmbientMute(); // toggle back

    stopAmbientSound();
    assert.equal(getAmbientState().currentSound, 'off');
  });
});
