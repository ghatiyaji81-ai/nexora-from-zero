'use client';

import { useEffect, useState } from 'react';

const SESSION_LENGTH = 25 * 60;

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function FocusTimer() {
  const [remaining, setRemaining] = useState(SESSION_LENGTH);
  const [isRunning, setIsRunning] = useState(false);
  const isComplete = remaining === 0;

  useEffect(() => {
    if (!isRunning) return;

    const intervalId = window.setInterval(() => {
      setRemaining(current => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isRunning]);

  useEffect(() => {
    if (isComplete) setIsRunning(false);
  }, [isComplete]);

  function reset() {
    setIsRunning(false);
    setRemaining(SESSION_LENGTH);
  }

  const progress = ((SESSION_LENGTH - remaining) / SESSION_LENGTH) * 100;

  return (
    <article className="focus-card" id="focus" aria-labelledby="focus-title">
      <div className="focus-card-heading">
        <div>
          <p className="card-kicker">A SMALL PLACE TO BEGIN</p>
          <h2 id="focus-title">Focus room</h2>
        </div>
        <span className="focus-session-label">25 MIN SESSION</span>
      </div>

      <div className="timer-layout">
        <div
          className="timer-ring"
          style={{ '--progress': `${progress}%` } as React.CSSProperties}
          role="img"
          aria-label={`${formatTime(remaining)} remaining`}
        >
          <div className="timer-ring-inner">
            <span className="timer-readout" aria-live="off">{formatTime(remaining)}</span>
            <span className="timer-caption">{isComplete ? 'SESSION COMPLETE' : isRunning ? 'IN FOCUS' : 'READY WHEN YOU ARE'}</span>
          </div>
        </div>

        <div className="timer-copy">
          <h3>{isComplete ? 'Nicely done.' : isRunning ? 'Stay with one thing.' : 'Give one thing your attention.'}</h3>
          <p>{isComplete ? 'Your session is complete. Take a breath before you begin again.' : 'A quiet 25-minute session. Your timer stays in this browser and never leaves your device.'}</p>
          <div className="timer-controls">
            <button className="button button-primary" type="button" onClick={() => setIsRunning(value => !value)} disabled={isComplete}>
              {isComplete ? 'Session complete' : isRunning ? 'Pause session' : 'Start session'}
              {!isComplete && <span aria-hidden="true">{isRunning ? 'Ⅱ' : '→'}</span>}
            </button>
            <button className="button button-quiet" type="button" onClick={reset} disabled={remaining === SESSION_LENGTH && !isRunning}>
              Reset
            </button>
          </div>
          <p className="timer-status" aria-live="polite">{isComplete ? 'Timer stopped at zero.' : isRunning ? 'The session is running.' : 'The session is paused.'}</p>
        </div>
      </div>
    </article>
  );
}
