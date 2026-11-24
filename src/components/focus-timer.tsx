'use client';

import { useEffect, useState, useRef } from 'react';
import {
  FocusSessionState,
  formatFocusTime,
  getFocusState,
  getGentleStreakData,
  GentleStreakData,
  initFocusManager,
  pauseFocusSession,
  resumeFocusSession,
  startBreakSession,
  startFocusSession,
  stopFocusSession,
} from '@/lib/focus-manager';
import {
  AmbientAudioState,
  AmbientSoundType,
  getAmbientState,
  setAmbientSound,
  setAmbientVolume,
  toggleAmbientMute,
} from '@/lib/ambient-sound';

const SESSION_LENGTH = 25 * 60;

export function FocusTimer() {
  const [focusState, setFocusState] = useState<FocusSessionState>(() => getFocusState());
  const [ambientState, setAmbientState] = useState<AmbientAudioState>(() => getAmbientState());
  const [streakData, setStreakData] = useState<GentleStreakData>(() => getGentleStreakData());

  // 20-20-20 Eye reminder state - repeats every 20 minutes (1200s) of focus
  const [eyeResting, setEyeResting] = useState(false);
  const [eyeCountdown, setEyeCountdown] = useState(20);
  const [lastDismissedCycle, setLastDismissedCycle] = useState<number>(0);
  const eyeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initialize focus manager state on mount
    const initial = initFocusManager();
    setFocusState(initial);
    setAmbientState(getAmbientState());
    setStreakData(getGentleStreakData());

    function handleStateChange(e: Event) {
      const customEvent = e as CustomEvent<FocusSessionState>;
      if (customEvent.detail) {
        setFocusState(customEvent.detail);
      } else {
        setFocusState(getFocusState());
      }
      setStreakData(getGentleStreakData());
    }

    function handleAmbientChange(e: Event) {
      const customEvent = e as CustomEvent<AmbientAudioState>;
      if (customEvent.detail) {
        setAmbientState(customEvent.detail);
      } else {
        setAmbientState(getAmbientState());
      }
    }

    function handleStartFocus() {
      startFocusSession('/#focus', SESSION_LENGTH);
      const el = document.getElementById('focus');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    window.addEventListener('nexora-focus-change', handleStateChange);
    window.addEventListener('nexora-ambient-change', handleAmbientChange);
    window.addEventListener('nexora-start-focus', handleStartFocus);

    if (typeof window !== 'undefined' && window.location.hash === '#focus-start') {
      handleStartFocus();
    }

    return () => {
      window.removeEventListener('nexora-focus-change', handleStateChange);
      window.removeEventListener('nexora-ambient-change', handleAmbientChange);
      window.removeEventListener('nexora-start-focus', handleStartFocus);
      if (eyeIntervalRef.current) clearInterval(eyeIntervalRef.current);
    };
  }, []);

  const isRunning = focusState.isActive && !focusState.isPaused;
  const isPaused = focusState.isActive && focusState.isPaused;
  const remaining = focusState.isActive ? focusState.remainingSeconds : SESSION_LENGTH;
  const isComplete = focusState.remainingSeconds === 0 && !focusState.isActive;
  const isBreak = Boolean(focusState.isBreakMode);

  const total = focusState.totalDurationSeconds || SESSION_LENGTH;
  const progress = ((total - remaining) / total) * 100;
  const elapsed = total - remaining;
  const current20MinCycle = Math.floor(elapsed / 1200);

  // 20-20-20 eye reminder triggers every 20 minutes (1200s) of continuous active focus
  const showEyeReminder =
    isRunning &&
    !isBreak &&
    elapsed >= 1200 &&
    current20MinCycle > lastDismissedCycle &&
    !eyeResting;

  function toggleTimer() {
    if (!focusState.isActive) {
      setLastDismissedCycle(0);
      startFocusSession('/#focus', SESSION_LENGTH);
    } else if (isRunning) {
      pauseFocusSession();
    } else {
      resumeFocusSession();
    }
  }

  function reset() {
    stopFocusSession();
    setEyeResting(false);
    setLastDismissedCycle(0);
    if (eyeIntervalRef.current) clearInterval(eyeIntervalRef.current);
  }

  function startEyeRest() {
    setEyeResting(true);
    setEyeCountdown(20);
    if (eyeIntervalRef.current) clearInterval(eyeIntervalRef.current);

    eyeIntervalRef.current = setInterval(() => {
      setEyeCountdown(prev => {
        if (prev <= 1) {
          if (eyeIntervalRef.current) clearInterval(eyeIntervalRef.current);
          setEyeResting(false);
          setLastDismissedCycle(current20MinCycle);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function handleSelectAmbient(type: AmbientSoundType) {
    setAmbientSound(type);
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value) / 100;
    setAmbientVolume(val);
  }

  return (
    <article className="focus-card" id="focus" aria-labelledby="focus-title">
      <div className="focus-card-heading">
        <div>
          <p className="card-kicker">A SMALL PLACE TO BEGIN</p>
          <h2 id="focus-title">Focus room</h2>
        </div>
        <div className="focus-card-meta">
          {focusState.isActive && focusState.distractionShieldEnabled && (
            <span className="focus-shield-badge" title="Distraction Shield Active">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>Shield On</span>
            </span>
          )}
          <span className="focus-session-label">
            {isBreak ? '5 MIN BREAK' : '25 MIN SESSION'}
          </span>
        </div>
      </div>

      <div className="timer-layout">
        <div
          className="timer-ring"
          style={{ '--progress': `${progress}%` } as React.CSSProperties}
          role="img"
          aria-label={`${formatFocusTime(remaining)} remaining`}
        >
          <div className="timer-ring-inner">
            <span className="timer-readout" aria-live="off">{formatFocusTime(remaining)}</span>
            <span className="timer-caption">
              {isComplete
                ? 'SESSION COMPLETE'
                : isBreak
                ? 'REST BREAK'
                : isRunning
                ? 'IN FOCUS'
                : isPaused
                ? 'PAUSED'
                : 'READY WHEN YOU ARE'}
            </span>
          </div>
        </div>

        <div className="timer-copy">
          <h3>
            {isComplete
              ? 'Nicely done.'
              : isBreak
              ? 'Rest your eyes & stretch.'
              : isRunning
              ? 'Stay with one thing.'
              : isPaused
              ? 'Session paused.'
              : 'Give one thing your attention.'}
          </h3>
          <p>
            {isComplete
              ? 'Your session is complete. Take a breath and relax before you begin again.'
              : isBreak
              ? 'Step away from the screen for a moment. Hydrate or look out a window.'
              : 'A quiet 25-minute session with Distraction Shield. Your timer stays in this browser and never leaves your device.'}
          </p>
          <div className="timer-controls">
            <button
              className="button button-primary"
              type="button"
              onClick={toggleTimer}
              disabled={isComplete}
            >
              {isComplete ? 'Session complete' : isRunning ? 'Pause session' : isPaused ? 'Resume session' : 'Start session'}
              {!isComplete && <span aria-hidden="true">{isRunning ? 'Ⅱ' : '→'}</span>}
            </button>
            <button
              className="button button-quiet"
              type="button"
              onClick={reset}
              disabled={!focusState.isActive && remaining === SESSION_LENGTH}
            >
              Reset
            </button>
          </div>
          <p className="timer-status" aria-live="polite">
            {isComplete
              ? 'Timer stopped at zero.'
              : isRunning
              ? isBreak
                ? 'Break time is ticking. Step away and breathe.'
                : 'The session is running with Distraction Shield active.'
              : isPaused
              ? 'The session is paused.'
              : 'The session is ready.'}
          </p>
        </div>
      </div>

      {/* 20-20-20 Eye Reminder Banner */}
      {(showEyeReminder || eyeResting) && (
        <div className="eye-reminder-card" role="status" aria-live="polite">
          <div className="eye-reminder-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            </svg>
          </div>
          <div className="eye-reminder-copy">
            <strong>20-20-20 Eye Reminder</strong>
            <p>
              {eyeResting
                ? `Look at an object 20 feet away: ${eyeCountdown}s remaining...`
                : 'Look at something 20 feet away for 20 seconds to prevent digital eye fatigue.'}
            </p>
          </div>
          <div className="eye-reminder-actions">
            {!eyeResting ? (
              <>
                <button
                  type="button"
                  className="button button-primary button-sm"
                  onClick={startEyeRest}
                >
                  Rest eyes (20s)
                </button>
                <button
                  type="button"
                  className="button button-quiet button-sm"
                  onClick={() => setLastDismissedCycle(current20MinCycle)}
                >
                  Dismiss
                </button>
              </>
            ) : (
              <span className="eye-countdown-pill">{eyeCountdown}s</span>
            )}
          </div>
        </div>
      )}

      {/* Break Nudge Card when 25m session completes */}
      {isComplete && !isBreak && (
        <div className="break-nudge-card" role="status">
          <div className="break-nudge-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
              <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
              <line x1="6" y1="2" x2="6" y2="4" />
              <line x1="10" y1="2" x2="10" y2="4" />
              <line x1="14" y1="2" x2="14" y2="4" />
            </svg>
          </div>
          <div className="break-nudge-copy">
            <strong>Break Nudge: Well Done</strong>
            <p>You completed a full 25-minute attention cycle. Give yourself a 5-minute break to recharge.</p>
          </div>
          <button
            type="button"
            className="button button-primary button-sm"
            onClick={() => startBreakSession(5)}
          >
            Start 5m Rest Break
          </button>
        </div>
      )}

      {/* Focus Room Upgrades: Ambient Sounds & Gentle Streaks */}
      <div className="focus-room-upgrades">
        {/* Ambient Sound Suite */}
        <div className="ambient-sound-section">
          <div className="ambient-header">
            <div className="ambient-title-lockup">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
              <span>Ambient Soundscape</span>
              <small className="ambient-sub-badge">Web Audio · Offline</small>
            </div>
            {ambientState.currentSound !== 'off' && (
              <span className="ambient-status-indicator">
                <span className="ambient-pulse-dot" />
                Playing {ambientState.currentSound}
              </span>
            )}
          </div>

          <div className="ambient-controls-row">
            <div className="ambient-presets" role="radiogroup" aria-label="Ambient sound presets">
              {(['off', 'rain', 'white-noise', 'lo-fi'] as AmbientSoundType[]).map(type => {
                const isActive = ambientState.currentSound === type;
                const labels: Record<AmbientSoundType, string> = {
                  off: 'Off',
                  rain: 'Rain',
                  'white-noise': 'White Noise',
                  'lo-fi': 'Lo-Fi Warm',
                };
                return (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={`ambient-preset-btn${isActive ? ' is-active' : ''}`}
                    onClick={() => handleSelectAmbient(type)}
                  >
                    {labels[type]}
                  </button>
                );
              })}
            </div>

            {ambientState.currentSound !== 'off' && (
              <div className="ambient-volume-suite">
                <button
                  type="button"
                  className="ambient-mute-btn"
                  onClick={toggleAmbientMute}
                  title={ambientState.isMuted ? 'Unmute ambient sound' : 'Mute ambient sound'}
                  aria-label={ambientState.isMuted ? 'Unmute' : 'Mute'}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {ambientState.isMuted || ambientState.volume === 0 ? (
                      <>
                        <path d="M11 5 6 9H2v6h4l5 4V5z" />
                        <line x1="23" y1="9" x2="17" y2="15" />
                        <line x1="17" y1="9" x2="23" y2="15" />
                      </>
                    ) : (
                      <>
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                      </>
                    )}
                  </svg>
                </button>
                <label className="sr-only" htmlFor="ambient-volume-slider">
                  Ambient sound volume
                </label>
                <input
                  id="ambient-volume-slider"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(ambientState.volume * 100)}
                  onChange={handleVolumeChange}
                  className="ambient-slider"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(ambientState.volume * 100)}
                  aria-valuetext={`${Math.round(ambientState.volume * 100)}% volume`}
                />
                <span className="ambient-vol-readout">
                  {ambientState.isMuted ? 'Muted' : `${Math.round(ambientState.volume * 100)}%`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Gentle Streaks (Never Guilt-Based) */}
        <div className="gentle-streaks-card">
          <div className="gentle-streaks-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
            </svg>
          </div>
          <div className="gentle-streaks-copy">
            <span className="gentle-streaks-headline">{streakData.message}</span>
            <small className="gentle-streaks-sub">
              {streakData.weekCount > 0
                ? `${streakData.weekCount} sessions this week · Showing up with calm intention`
                : 'Every quiet session counts · Never guilt-based'}
            </small>
          </div>
        </div>
      </div>
    </article>
  );
}
