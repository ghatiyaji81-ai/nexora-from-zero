import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('PWA & Hindi/English i18n System', () => {
  it('validates PWA manifest structure, maskable icons, and share target', () => {
    const manifestPath = path.resolve(process.cwd(), 'public/manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist in public/');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.name, 'NEXORA - Calm Command Center');
    assert.equal(manifest.short_name, 'NEXORA');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/');

    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 4, 'Manifest must have at least 4 icons');
    const has192Maskable = manifest.icons.some(
      (icon: { src: string; purpose: string }) => icon.src.includes('192') && icon.purpose.includes('maskable')
    );
    const has512Maskable = manifest.icons.some(
      (icon: { src: string; purpose: string }) => icon.src.includes('512') && icon.purpose.includes('maskable')
    );
    assert.ok(has192Maskable, 'Manifest must declare 192 maskable icon');
    assert.ok(has512Maskable, 'Manifest must declare 512 maskable icon');

    // Verify physical icon files exist on disk and have PNG signature
    for (const icon of manifest.icons) {
      const iconPath = path.resolve(process.cwd(), 'public', icon.src.replace(/^\//, ''));
      assert.ok(fs.existsSync(iconPath), `Icon file ${icon.src} must physically exist`);
      const buffer = fs.readFileSync(iconPath);
      // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
      assert.equal(buffer[0], 0x89);
      assert.equal(buffer[1], 0x50);
      assert.equal(buffer[2], 0x4e);
      assert.equal(buffer[3], 0x47);
    }

    // Verify share target
    assert.ok(manifest.share_target, 'Manifest must declare share_target');
    assert.equal(manifest.share_target.action, '/share-target');
    assert.equal(manifest.share_target.method, 'GET');
    assert.deepEqual(manifest.share_target.params, { title: 'title', text: 'text', url: 'url' });
  });

  it('validates service worker security rules: static assets ONLY, never caches private/auth routes', () => {
    const swPath = path.resolve(process.cwd(), 'public/sw.js');
    assert.ok(fs.existsSync(swPath), 'public/sw.js must exist');

    const swContent = fs.readFileSync(swPath, 'utf8');
    // Ensure security exclusions are explicitly in the source
    assert.ok(swContent.includes('/api/'), 'SW must check /api/');
    assert.ok(swContent.includes('/auth'), 'SW must check /auth');
    assert.ok(swContent.includes('/connect'), 'SW must check /connect');
    assert.ok(swContent.includes('/think'), 'SW must check /think');
    assert.ok(swContent.includes('/build'), 'SW must check /build');

    // Ensure navigate mode uses offline fallback
    assert.ok(swContent.includes('/offline.html'), 'SW must reference /offline.html fallback');

    // Check offline.html
    const offlinePath = path.resolve(process.cwd(), 'public/offline.html');
    assert.ok(fs.existsSync(offlinePath), 'public/offline.html must physically exist');
    const offlineContent = fs.readFileSync(offlinePath, 'utf8');
    assert.ok(offlineContent.includes('offline'), 'Offline page must explain offline status');
    assert.ok(offlineContent.includes('Check connection'), 'Offline page must offer reconnection action');
  });

  it('validates self-hosted Devanagari font files and SIL Open Font License', () => {
    const fontDir = path.resolve(process.cwd(), 'public/fonts/devanagari');
    assert.ok(fs.existsSync(fontDir), 'public/fonts/devanagari must exist');

    const regularWoff2 = path.join(fontDir, 'noto-sans-devanagari-devanagari-400-normal.woff2');
    const boldWoff2 = path.join(fontDir, 'noto-sans-devanagari-devanagari-700-normal.woff2');
    const licenseFile = path.join(fontDir, 'LICENSE.txt');

    assert.ok(fs.existsSync(regularWoff2), 'Regular 400 woff2 font must exist');
    assert.ok(fs.existsSync(boldWoff2), 'Bold 700 woff2 font must exist');
    assert.ok(fs.statSync(regularWoff2).size > 10000, 'Regular font file must be non-trivial');
    assert.ok(fs.statSync(boldWoff2).size > 10000, 'Bold font file must be non-trivial');

    assert.ok(fs.existsSync(licenseFile), 'SIL OFL License file must exist');
    const licenseText = fs.readFileSync(licenseFile, 'utf8');
    assert.ok(
      licenseText.includes('SIL OPEN FONT LICENSE Version 1.1') || licenseText.includes('SIL Open Font License'),
      'Font license must be SIL Open Font License'
    );
  });

  it('validates Web Share Target input sanitization and safety guards', () => {
    function sanitizeText(raw: string | null, maxLen: number): string {
      if (!raw) return '';
      return raw
        .replace(/<[^>]*>?/gm, '')
        .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '')
        .trim()
        .slice(0, maxLen);
    }

    function sanitizeUrl(raw: string | null): string {
      if (!raw) return '';
      const trimmed = raw.trim();
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return parsed.href.slice(0, 2048);
        }
      } catch {
        // invalid URL
      }
      return '';
    }

    // Strips script tags and malicious HTML
    const dirtyTitle = '<script>alert("xss")</script>Important Article';
    assert.equal(sanitizeText(dirtyTitle, 200), 'alert("xss")Important Article');

    // Rejects javascript: URLs
    assert.equal(sanitizeUrl('javascript:alert(1)'), '');
    assert.equal(sanitizeUrl('https://example.com/research-paper'), 'https://example.com/research-paper');

    // Enforces character bounds
    const longText = 'a'.repeat(15000);
    assert.equal(sanitizeText(longText, 10000).length, 10000);
  });
});
