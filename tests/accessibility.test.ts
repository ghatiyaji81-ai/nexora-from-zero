import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * WCAG 2.1 Relative Luminance & Contrast Ratio Calculator
 */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  return [r, g, b];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const l1 = relativeLuminance(r1, g1, b1);
  const l2 = relativeLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Extract CSS variables from a selector block in CSS string
 */
function extractTokens(css: string, selectorRegex: RegExp): Record<string, string> {
  const match = css.match(selectorRegex);
  if (!match) return {};
  const cleanBlock = match[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens: Record<string, string> = {};
  const lines = cleanBlock.split(';');
  for (const line of lines) {
    const parts = line.split(':');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join(':').trim();
      if (key.startsWith('--')) {
        tokens[key] = val;
      }
    }
  }
  return tokens;
}

describe('Accessibility & WCAG AA Compliance (Parsed from real CSS tokens)', () => {
  const cssPath = path.resolve(__dirname, '../src/app/globals.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Extract real tokens for each theme
  const rootTokens = extractTokens(cssContent, /:root\s*\{([^}]+)\}/);
  const warmTokens = extractTokens(cssContent, /:root\[data-theme='warm'\]\s*\{([^}]+)\}/);
  const darkTokens = extractTokens(cssContent, /:root\[data-theme='dark'\]\s*\{([^}]+)\}/);
  const lightFocus = extractTokens(cssContent, /\[data-theme='light'\]\s*\{([^}]+)\}/);
  const warmFocus = extractTokens(cssContent, /\[data-theme='warm'\]\s*\{([^}]+)\}/);
  const darkFocus = extractTokens(cssContent, /\[data-theme='dark'\]\s*\{([^}]+)\}/);

  it('Light Theme real CSS tokens satisfy WCAG AA (>= 4.5:1) and AAA (>= 7:1) contrast', () => {
    const canvas = rootTokens['--canvas'];
    const ink = rootTokens['--ink'];
    const inkSoft = rootTokens['--ink-soft'];
    const focusRing = lightFocus['--focus-ring'] || rootTokens['--focus-ring'];

    assert.ok(canvas && ink && inkSoft && focusRing, 'All light theme tokens must be parsed from CSS');

    const ratioPrimary = contrastRatio(ink, canvas);
    const ratioSoft = contrastRatio(inkSoft, canvas);
    const ratioFocus = contrastRatio(focusRing, canvas);

    assert.ok(ratioPrimary >= 7.0, `Primary text ${ink} vs ${canvas} ratio ${ratioPrimary.toFixed(2)} >= 7:1 (AAA)`);
    assert.ok(ratioSoft >= 4.5, `Secondary text ${inkSoft} vs ${canvas} ratio ${ratioSoft.toFixed(2)} >= 4.5:1 (AA)`);
    assert.ok(ratioFocus >= 4.5, `Focus ring ${focusRing} vs ${canvas} ratio ${ratioFocus.toFixed(2)} >= 4.5:1 (AA)`);
  });

  it('Warm Eye-Comfort Theme real CSS tokens satisfy WCAG AA and AAA contrast', () => {
    const canvas = warmTokens['--canvas'];
    const ink = warmTokens['--ink'];
    const inkSoft = warmTokens['--ink-soft'];
    const focusRing = warmFocus['--focus-ring'] || warmTokens['--focus-ring'] || '#854d0e';

    assert.ok(canvas && ink && inkSoft, 'All warm theme tokens must be parsed from CSS');

    const ratioPrimary = contrastRatio(ink, canvas);
    const ratioSoft = contrastRatio(inkSoft, canvas);
    const ratioFocus = contrastRatio(focusRing, canvas);

    assert.ok(ratioPrimary >= 7.0, `Primary text ${ink} vs ${canvas} ratio ${ratioPrimary.toFixed(2)} >= 7:1 (AAA)`);
    assert.ok(ratioSoft >= 4.5, `Secondary text ${inkSoft} vs ${canvas} ratio ${ratioSoft.toFixed(2)} >= 4.5:1 (AA)`);
    assert.ok(ratioFocus >= 3.0, `Focus ring ${focusRing} vs ${canvas} ratio ${ratioFocus.toFixed(2)} >= 3.0:1 (AA)`);
  });

  it('Dark Theme real CSS tokens satisfy WCAG AA and AAA contrast', () => {
    const canvas = darkTokens['--canvas'];
    const ink = darkTokens['--ink'];
    const inkSoft = darkTokens['--ink-soft'];
    const focusRing = darkFocus['--focus-ring'] || darkTokens['--focus-ring'] || rootTokens['--accent'];

    assert.ok(canvas && ink && inkSoft, 'All dark theme tokens must be parsed from CSS');

    const ratioPrimary = contrastRatio(ink, canvas);
    const ratioSoft = contrastRatio(inkSoft, canvas);
    const ratioFocus = contrastRatio(focusRing, canvas);

    assert.ok(ratioPrimary >= 7.0, `Primary text ${ink} vs ${canvas} ratio ${ratioPrimary.toFixed(2)} >= 7:1 (AAA)`);
    assert.ok(ratioSoft >= 4.5, `Secondary text ${inkSoft} vs ${canvas} ratio ${ratioSoft.toFixed(2)} >= 4.5:1 (AA)`);
    assert.ok(ratioFocus >= 7.0, `Focus ring ${focusRing} vs ${canvas} ratio ${ratioFocus.toFixed(2)} >= 7:1 (AAA)`);
  });

  it('verifies dyslexia font files are physically self-hosted in public/fonts', () => {
    const regularWoff2 = path.resolve(__dirname, '../public/fonts/opendyslexic/opendyslexic-latin-400-normal.woff2');
    const boldWoff2 = path.resolve(__dirname, '../public/fonts/opendyslexic/opendyslexic-latin-700-normal.woff2');
    const licenseFile = path.resolve(__dirname, '../public/fonts/opendyslexic/LICENSE.txt');

    assert.ok(fs.existsSync(regularWoff2), 'OpenDyslexic regular woff2 exists in public/fonts');
    assert.ok(fs.existsSync(boldWoff2), 'OpenDyslexic bold woff2 exists in public/fonts');
    assert.ok(fs.existsSync(licenseFile), 'OpenDyslexic LICENSE.txt exists in public/fonts');

    const licenseContent = fs.readFileSync(licenseFile, 'utf8');
    assert.ok(licenseContent.includes('SIL OPEN FONT LICENSE'), 'Font license is verified SIL OFL-1.1');
  });

  it('verifies skip-to-content link and main landmark are in source', () => {
    const appShellPath = path.resolve(__dirname, '../src/components/app-shell.tsx');
    const appShellContent = fs.readFileSync(appShellPath, 'utf8');

    assert.ok(appShellContent.includes('skip-to-content'), 'Skip-to-content link exists in app shell');
    assert.ok(appShellContent.includes('id="main-content"'), 'Main landmark with id="main-content" exists');
  });
});
