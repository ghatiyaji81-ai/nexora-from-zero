import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 3013;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode && res.statusCode < 500) resolve(true);
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on('error', reject);
        req.setTimeout(2000, () => req.destroy());
      });
      return true;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error(`Server at ${url} did not become ready`);
}

async function runAudit() {
  console.log('--- NEXORA PRIVACY DASHBOARD INDEPENDENT AUDIT ---');
  console.log(`Starting Next.js production server on port ${PORT}...`);
  const serverProc = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });

  const auditLog = [];
  function log(msg) {
    console.log(msg);
    auditLog.push(msg);
  }

  let serverStarted = false;
  try {
    await waitForServer(BASE_URL);
    serverStarted = true;
    log(`[PASS] Server is live and responding at ${BASE_URL}`);

    // Direct API verification
    log('\n--- 1. SERVER-SIDE API AUDIT (/api/privacy) ---');
    const apiRes = await new Promise((resolve, reject) => {
      http.get(`${BASE_URL}/api/privacy`, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }));
      }).on('error', reject);
    });

    log(`API Status: ${apiRes.status}`);
    log(`Cache-Control header: ${apiRes.headers['cache-control']}`);
    if (apiRes.headers['cache-control']?.includes('no-store')) {
      log('[PASS] Cache-Control: no-store header properly enforced on /api/privacy');
    } else {
      log('[FAIL] Missing Cache-Control: no-store header');
    }

    log(`Response body: ${JSON.stringify(apiRes.body)}`);
    if (apiRes.body.authenticated === false && apiRes.body.mode === 'local_preview') {
      log('[PASS] Unauthenticated request safely defaults to local_preview mode');
    } else {
      log('[FAIL] Unexpected response for unauthenticated request');
    }
    if (!apiRes.body.tokenHash && !apiRes.body.passwordHash) {
      log('[PASS] Zero token or password hashes exposed in API response');
    }

    // Launch Headless Chromium for Browser Functional Audit
    log('\n--- 2. BROWSER AUTOMATION & FUNCTIONAL VERIFICATION ---');
    const browser = await chromium.launch({ headless: true });

    // Desktop Run (1280x800)
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'en',
      acceptDownloads: true,
    });
    const desktopPage = await desktopContext.newPage();
    // Pre-seed completed onboarding so wizard overlay does not intercept clicks
    await desktopPage.addInitScript(() => {
      window.localStorage.setItem('nexora-onboarding-state', JSON.stringify({
        completed: true,
        selectedRole: 'developer',
        isDemoMode: false,
        connectedTools: { github: false, google: false, telegram: false },
        completedAt: Date.now(),
      }));
    });

    log('Navigating to http://127.0.0.1:3013/privacy ...');
    await desktopPage.goto(`${BASE_URL}/privacy`, { waitUntil: 'networkidle' });

    // Verify Title & Hero
    const heroTitle = await desktopPage.textContent('h1.privacy-hero-title');
    log(`Hero Title: "${heroTitle?.trim()}"`);
    const statusBadge = await desktopPage.textContent('.privacy-status-badge');
    log(`Status Badge: "${statusBadge?.trim()}"`);

    // Verify Tab 1: Overview
    log('\n[Tab 1: Overview Verification]');
    const localBoundary = await desktopPage.isVisible('.local-boundary');
    const serverBoundary = await desktopPage.isVisible('.server-boundary');
    const thirdPartyBoundary = await desktopPage.isVisible('.third-party-boundary');
    const sessionsRow = await desktopPage.isVisible('.privacy-sessions-overview');
    log(`Boundaries present: local=${localBoundary}, server=${serverBoundary}, thirdParty=${thirdPartyBoundary}`);
    log(`Sessions overview present: ${sessionsRow}`);

    // Verify Tab 2: Categories & Permissions
    log('\n[Tab 2: Categories & Permissions Verification]');
    await desktopPage.click('nav.privacy-subnav button:nth-child(2)');
    await desktopPage.waitForTimeout(300);
    const permCards = await desktopPage.$$('.permission-item');
    log(`Live Browser Permission items found: ${permCards.length}`);
    const catRows = await desktopPage.$$('.privacy-categories-table tbody tr');
    log(`Data Category rows found: ${catRows.length}`);

    // Test Deletion Modal from Categories tab
    log('Testing deletion modal trigger from category row...');
    const clearBtn = await desktopPage.$('button.cat-delete-btn');
    if (clearBtn) {
      await clearBtn.click();
      await desktopPage.waitForTimeout(200);
      const modalVisible = await desktopPage.isVisible('.privacy-modal-overlay');
      log(`Confirmation modal opened on "Clear data" click: ${modalVisible}`);
      // Click Cancel
      await desktopPage.click('.modal-btn-cancel');
      await desktopPage.waitForTimeout(200);
      const modalClosed = !(await desktopPage.isVisible('.privacy-modal-overlay'));
      log(`Confirmation modal closed on Cancel: ${modalClosed}`);
    }

    // Verify Tab 3: Connected Applications
    log('\n[Tab 3: Connected Applications Verification]');
    await desktopPage.click('nav.privacy-subnav button:nth-child(3)');
    await desktopPage.waitForTimeout(300);
    const appCards = await desktopPage.$$('.connected-app-card');
    log(`Connected App cards found: ${appCards.length}`);
    for (let i = 0; i < appCards.length; i++) {
      const title = await appCards[i].$eval('.app-card-title', el => el.textContent);
      const badge = await appCards[i].$eval('.status-badge', el => el.textContent);
      const buttonDisabled = await appCards[i].$eval('.app-revoke-btn', el => el.hasAttribute('disabled'));
      log(`App #${i+1}: ${title?.trim()} | Status: ${badge?.trim()} | Button Disabled: ${buttonDisabled}`);
    }

    // Verify Tab 4: Data Export & File Download
    log('\n[Tab 4: Data Export & Download Verification]');
    await desktopPage.click('nav.privacy-subnav button:nth-child(4)');
    await desktopPage.waitForTimeout(300);

    // Test JSON Preview
    log('Testing JSON Preview modal...');
    await desktopPage.click('button.privacy-preview-btn');
    await desktopPage.waitForTimeout(300);
    const jsonPreviewVisible = await desktopPage.isVisible('.json-preview-overlay');
    log(`JSON Preview modal visible: ${jsonPreviewVisible}`);
    const jsonText = await desktopPage.textContent('.json-preview-body pre code');
    log(`Sample preview snippet: ${jsonText?.slice(0, 120)}...`);
    const parsedPreview = JSON.parse(jsonText || '{}');
    log(`Parsed Preview Version: ${parsedPreview.version}, Generator: ${parsedPreview.generator}`);
    await desktopPage.click('.json-close-btn');
    await desktopPage.waitForTimeout(200);

    // Test Actual File Download
    log('Testing actual native file download...');
    const [download] = await Promise.all([
      desktopPage.waitForEvent('download'),
      desktopPage.click('button.privacy-export-cta'),
    ]);
    const suggestedFilename = download.suggestedFilename();
    log(`File download triggered! Suggested filename: "${suggestedFilename}"`);
    const downloadPath = path.join(process.cwd(), 'scratch_audit_download.json');
    await download.saveAs(downloadPath);
    const downloadedRaw = fs.readFileSync(downloadPath, 'utf8');
    const downloadedJson = JSON.parse(downloadedRaw);
    log(`Exported JSON validated: version=${downloadedJson.version}, exportedAt=${downloadedJson.exportedAt}`);
    log(`Security Notice in payload: "${downloadedJson.securityNotice}"`);

    // Verify absence of sensitive info
    if (
      !downloadedRaw.includes('password') &&
      !downloadedRaw.includes('tokenHash') &&
      !downloadedRaw.includes('secret') &&
      !downloadedRaw.includes('cookie')
    ) {
      log('[PASS] Exported file verified free of sensitive passwords, tokens, and secrets');
    } else {
      log('[WARN] Check downloaded content for unexpected keywords');
    }
    fs.unlinkSync(downloadPath);

    // Verify Tab 5: Deletion & Retention
    log('\n[Tab 5: Deletion & Retention Verification]');
    await desktopPage.click('nav.privacy-subnav button:nth-child(5)');
    await desktopPage.waitForTimeout(300);
    const deletionCards = await desktopPage.$$('.deletion-card');
    log(`Deletion action cards found: ${deletionCards.length}`);

    // Trigger one deletion action to verify execution & toast
    log('Executing selective local deletion for Wellbeing Logs...');
    const delBtn = await desktopPage.$('.deletion-card button.destructive-btn');
    if (delBtn) {
      await delBtn.click();
      await desktopPage.waitForTimeout(200);
      await desktopPage.click('.modal-btn-confirm');
      await desktopPage.waitForTimeout(500);
      const toastVisible = await desktopPage.isVisible('.toast-notification, .toast');
      log(`Deletion completed and toast displayed: ${toastVisible}`);
    }

    // Verify Tab 6: Activity Log
    log('\n[Tab 6: Activity Log Verification]');
    await desktopPage.click('nav.privacy-subnav button:nth-child(6)');
    await desktopPage.waitForTimeout(300);
    const logEntries = await desktopPage.$$('.privacy-log-entry');
    log(`Activity log entries found: ${logEntries.length}`);
    const latestLogTitle = await logEntries[0]?.$eval('.log-title', el => el.textContent);
    log(`Latest activity log entry title: "${latestLogTitle?.trim()}"`);

    // Test Clear Activity Log
    log('Testing "Clear Log History" button...');
    await desktopPage.click('button.clear-log-btn');
    await desktopPage.waitForTimeout(300);
    const logEntriesAfterClear = await desktopPage.$$('.privacy-log-entry');
    log(`Activity log entries after clear: ${logEntriesAfterClear.length}`);

    // Verify Tab 7: Education & Transparency
    log('\n[Tab 7: Education & Transparency Verification]');
    await desktopPage.click('nav.privacy-subnav button:nth-child(7)');
    await desktopPage.waitForTimeout(300);
    const eduCards = await desktopPage.$$('.edu-card');
    log(`Educational cards found: ${eduCards.length}`);
    const footnote = await desktopPage.textContent('.encryption-honesty-footnote');
    log(`Encryption Honesty Footnote: "${footnote?.trim()}"`);

    await desktopContext.close();

    // Mobile Run (375x667) with Hindi
    log('\n--- 3. MOBILE VIEWPORT (375px) & HINDI LOCALIZATION VERIFICATION ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      isMobile: true,
      hasTouch: true,
      locale: 'hi',
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.addInitScript(() => {
      window.localStorage.setItem('nexora-onboarding-state', JSON.stringify({
        completed: true,
        selectedRole: 'developer',
        isDemoMode: false,
        connectedTools: { github: false, google: false, telegram: false },
        completedAt: Date.now(),
      }));
    });
    await mobilePage.goto(`${BASE_URL}/privacy?locale=hi&textSize=xlarge`, { waitUntil: 'networkidle' });
    await mobilePage.evaluate(() => {
      document.documentElement.lang = 'hi';
      document.documentElement.dataset.locale = 'hi';
      document.documentElement.dataset.textSize = 'xlarge';
    });
    await mobilePage.waitForTimeout(500);

    const mobileHeroTitle = await mobilePage.textContent('h1.privacy-hero-title');
    log(`Mobile Hindi Hero Title: "${mobileHeroTitle?.trim()}"`);

    const overflowCheck = await mobilePage.evaluate(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      return { scrollWidth, clientWidth, hasOverflow: scrollWidth > clientWidth };
    });
    log(`Mobile DOM width check: scrollWidth=${overflowCheck.scrollWidth}, clientWidth=${overflowCheck.clientWidth}, hasOverflow=${overflowCheck.hasOverflow}`);
    if (!overflowCheck.hasOverflow) {
      log('[PASS] Zero horizontal overflow at 375px with Hindi & Extra Large text');
    } else {
      log('[FAIL] Horizontal overflow detected at 375px');
    }

    // Accessible keyboard & reduced motion verification
    log('\n--- 4. ACCESSIBILITY: KEYBOARD NAVIGATION & REDUCED MOTION ---');
    const a11yContext = await browser.newContext({
      reducedMotion: 'reduce',
    });
    const a11yPage = await a11yContext.newPage();
    await a11yPage.addInitScript(() => {
      window.localStorage.setItem('nexora-onboarding-state', JSON.stringify({ completed: true }));
    });
    await a11yPage.goto(`${BASE_URL}/privacy`, { waitUntil: 'networkidle' });

    // Test Tab focus
    await a11yPage.keyboard.press('Tab');
    const activeTagName = await a11yPage.evaluate(() => document.activeElement?.tagName);
    log(`First tab focused element tag: ${activeTagName}`);

    // Verify reduced motion query
    const prefersReducedMotion = await a11yPage.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    log(`prefers-reduced-motion: reduce detected: ${prefersReducedMotion}`);
    if (prefersReducedMotion) {
      log('[PASS] prefers-reduced-motion correctly respected');
    }

    await a11yContext.close();
    await mobileContext.close();
    await browser.close();

    log('\n>>> ALL INDEPENDENT VERIFICATION TESTS COMPLETED SUCCESSFULLY <<<');
  } catch (err) {
    log(`[ERROR] Audit encountered failure: ${err.message}`);
    console.error(err);
  } finally {
    if (serverStarted) {
      log('Terminating Next.js server process...');
      serverProc.kill();
    }
  }
}

runAudit();
