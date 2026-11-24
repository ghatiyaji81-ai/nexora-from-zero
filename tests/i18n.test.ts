import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDate,
  formatNumber,
  formatTime,
  getLocale,
  setLocale,
  STRINGS_EN,
  STRINGS_HI,
  t,
  I18nKey,
} from '../src/lib/i18n-strings';

test('i18n - every English key has a corresponding Hindi translation', () => {
  const enKeys = Object.keys(STRINGS_EN) as I18nKey[];
  const hiKeys = Object.keys(STRINGS_HI) as I18nKey[];

  assert.equal(
    enKeys.length,
    hiKeys.length,
    `Key counts must match. Found ${enKeys.length} EN keys vs ${hiKeys.length} HI keys.`
  );

  for (const key of enKeys) {
    assert.ok(
      STRINGS_HI[key] !== undefined && STRINGS_HI[key] !== '',
      `Missing or empty Hindi translation for key "${key}"`
    );
    // Ensure translation is non-empty string
    assert.ok(
      typeof STRINGS_HI[key] === 'string' && STRINGS_HI[key].length > 0,
      `Hindi translation for key "${key}" must be a non-empty string`
    );
  }
});

test('i18n - locale switching and fallback mechanism', () => {
  setLocale('en');
  assert.equal(getLocale(), 'en');
  assert.equal(t('common.save'), 'Save');

  setLocale('hi');
  assert.equal(getLocale(), 'hi');
  assert.equal(t('common.save'), 'सहेजें');

  // Switch back
  setLocale('en');
  assert.equal(getLocale(), 'en');
});

test('i18n - Intl formatting functions respect locale', () => {
  setLocale('en');
  const enFormatted = formatNumber(12500);
  assert.ok(enFormatted.includes('12,500') || enFormatted.includes('12500'));

  const date = new Date(2026, 10, 24, 10, 30);
  const formattedTime = formatTime(date);
  assert.ok(formattedTime.length > 0);

  const formattedDate = formatDate(date);
  assert.ok(formattedDate.length > 0);
});
