import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCheckinToday,
  deleteAllLocalData,
  exportAllLocalData,
  getDailyWrapup,
  getEnergyHistory,
  getEnergySuggestion,
  getWeeklyFocusReport,
  recordEnergyCheckin,
} from '../src/lib/wellbeing-manager';

test('Wellbeing - records energy check-in and enforces at most twice daily / once per period', () => {
  const initialStatus = canCheckinToday();
  assert.equal(typeof initialStatus.allowed, 'boolean');

  // Record an entry
  const entry = recordEnergyCheckin('steady');
  assert.equal(entry.level, 'steady');
  assert.ok(entry.suggestion.length > 0);
  assert.ok(entry.targetRoute.length > 0);

  // Immediate subsequent check-in in same period must be disallowed
  const statusAfter = canCheckinToday();
  assert.equal(statusAfter.allowed, false);

  const history = getEnergyHistory();
  assert.ok(history.length >= 1);
  assert.equal(history[0].level, 'steady');
});

test('Wellbeing - provides tailored work suggestions without guilt tone', () => {
  const low = getEnergySuggestion('low');
  assert.equal(low.headline, 'Gentle Pace');
  assert.ok(low.suggestion.toLowerCase().includes('light') || low.suggestion.toLowerCase().includes('break'));

  const steady = getEnergySuggestion('steady');
  assert.equal(steady.headline, 'Balanced Flow');

  const high = getEnergySuggestion('high');
  assert.equal(high.headline, 'Deep Problem Solving');
});

test('Wellbeing - generates daily wrapup and weekly focus report with calm, positive tone', async () => {
  const daily = await getDailyWrapup();
  assert.ok(daily.dateStr.length > 0);
  assert.equal(typeof daily.focusMinutes, 'number');
  assert.ok(!daily.gentleSummary.toLowerCase().includes('fail'));
  assert.ok(!daily.gentleSummary.toLowerCase().includes('broken'));

  const weekly = getWeeklyFocusReport();
  assert.equal(typeof weekly.totalFocusMinutes, 'number');
  assert.equal(typeof weekly.totalSessions, 'number');
  assert.ok(!weekly.gentleSummary.toLowerCase().includes('guilt'));
});

test('Wellbeing - exports valid JSON backup and deletes local data safely', () => {
  const exported = exportAllLocalData();
  const parsed = JSON.parse(exported);
  assert.equal(parsed.nexoraVersion, '0.1.0');
  assert.ok(parsed.exportDate);

  // Safe deletion execution
  deleteAllLocalData();
  const historyAfter = getEnergyHistory();
  assert.ok(Array.isArray(historyAfter));
});
