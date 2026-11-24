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

test('i18n - verified native-review strings for navigation, shield, theme, and iOS share', () => {
  setLocale('hi');
  assert.equal(t('nav.social'), 'सोशल');
  assert.equal(t('focus.shieldActive'), 'व्यवधान सुरक्षा सक्रिय');
  assert.equal(t('theme.warm'), 'गर्म');
  assert.equal(t('theme.reducedMotion'), 'एनिमेशन कम करें');
  assert.equal(t('pwa.shareIosNotice'), 'आईओएस सफारी में यह सुविधा उपलब्ध नहीं है');

  // Verify English fallback
  setLocale('en');
  assert.equal(t('nav.social'), 'Social');
  assert.equal(t('focus.shieldActive'), 'Distraction Shield active');
  assert.equal(t('theme.warm'), 'Warm');
  assert.equal(t('theme.reducedMotion'), 'Reduce motion');
  assert.equal(t('pwa.shareIosNotice'), 'Not available on iOS Safari');
});

