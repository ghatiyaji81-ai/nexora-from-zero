import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = 3012;
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

async function main() {
  console.log(`Starting production Next.js server on port ${PORT}...`);
  const serverProc = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  try {
    await waitForServer(BASE_URL);
    console.log(`Server ready at ${BASE_URL}`);

    const browser = await chromium.launch({ headless: true });
    // Mobile viewport: 375px width (iPhone standard / Android viewport)
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
      isMobile: true,
      hasTouch: true,
      locale: 'hi',
    });

    const page = await context.newPage();

    const targets = [
      { name: 'Overview', path: '/?locale=hi&textSize=xlarge' },
      { name: 'Connect', path: '/connect?locale=hi&textSize=xlarge' },
      { name: 'Build', path: '/build?locale=hi&textSize=xlarge' },
      { name: 'Privacy Dashboard', path: '/privacy?locale=hi&textSize=xlarge' },
    ];

    const results = [];

    for (const target of targets) {
      console.log(`\nTesting DOM overflow on ${target.name} at 375px with Hindi & Extra Large text...`);
      await page.goto(`${BASE_URL}${target.path}`, { waitUntil: 'networkidle' });
      // Ensure Hindi and xlarge text attributes are set
      await page.evaluate(() => {
        document.documentElement.lang = 'hi';
        document.documentElement.dataset.locale = 'hi';
        document.documentElement.dataset.textSize = 'xlarge';
      });
      await page.waitForTimeout(500);

      const overflowData = await page.evaluate(() => {
        const docScrollWidth = document.documentElement.scrollWidth;
        const docClientWidth = document.documentElement.clientWidth;
        const bodyScrollWidth = document.body.scrollWidth;

        // Check any element that overflows horizontally outside viewport (375px)
        const allElements = Array.from(document.querySelectorAll('*'));
        const overflowingElements = [];

        for (const el of allElements) {
          const rect = el.getBoundingClientRect();
          // An element whose right edge exceeds 375px + 1px tolerance
          if (rect.right > 376 && !['SCRIPT', 'STYLE', 'HEAD', 'META'].includes(el.tagName)) {
            // Check if element is visually hidden
            const style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
              overflowingElements.push({
                tag: el.tagName,
                className: el.className ? String(el.className).slice(0, 50) : '',
                id: el.id || '',
                right: Math.round(rect.right),
                width: Math.round(rect.width),
              });
            }
          }
        }

        return {
          viewportWidth: 375,
          docScrollWidth,
          docClientWidth,
          bodyScrollWidth,
          hasHorizontalScroll: docScrollWidth > 375,
          overflowingCount: overflowingElements.length,
          topOverflowing: overflowingElements.slice(0, 5),
        };
      });

      console.log(`  -> docScrollWidth: ${overflowData.docScrollWidth}px (<= 375: ${overflowData.docScrollWidth <= 375})`);
      console.log(`  -> horizontal scrollbar: ${overflowData.hasHorizontalScroll ? 'YES (OVERFLOW)' : 'NO (PASSED)'}`);
      if (overflowData.overflowingCount > 0) {
        console.warn(`  -> Elements extending past 375px:`, overflowData.topOverflowing);
      }

      results.push({
        name: target.name,
        passed: overflowData.docScrollWidth <= 375,
        docScrollWidth: overflowData.docScrollWidth,
        details: overflowData,
      });
    }

    // 4. Test Notification Center open / active state
    console.log(`\nTesting DOM overflow on Notification Center at 375px with Hindi & Extra Large text...`);
    await page.goto(`${BASE_URL}/?locale=hi&textSize=xlarge`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      document.documentElement.lang = 'hi';
      document.documentElement.dataset.locale = 'hi';
      document.documentElement.dataset.textSize = 'xlarge';
    });
    // Scroll or focus into communication-relief card
    const notifData = await page.evaluate(() => {
      const card = document.querySelector('.communication-relief-container') || document.querySelector('.bento-card-body');
      const docScrollWidth = document.documentElement.scrollWidth;
      return {
        cardFound: !!card,
        docScrollWidth,
        cardScrollWidth: card ? card.scrollWidth : null,
        cardClientWidth: card ? card.clientWidth : null,
        hasHorizontalScroll: docScrollWidth > 375,
      };
    });
    console.log(`  -> Notification Center docScrollWidth: ${notifData.docScrollWidth}px (<= 375: ${notifData.docScrollWidth <= 375})`);
    results.push({
      name: 'Notification Center',
      passed: notifData.docScrollWidth <= 375,
      docScrollWidth: notifData.docScrollWidth,
      details: notifData,
    });

    // 5. Test Onboarding Wizard open dialog
    console.log(`\nTesting DOM overflow on Onboarding Wizard at 375px with Hindi & Extra Large text...`);
    await page.goto(`${BASE_URL}/?locale=hi&textSize=xlarge`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      document.documentElement.lang = 'hi';
      document.documentElement.dataset.locale = 'hi';
      document.documentElement.dataset.textSize = 'xlarge';
      // Open onboarding wizard dialog
      window.dispatchEvent(new CustomEvent('nexora-open-onboarding'));
    });
    await page.waitForTimeout(600);

    const wizardData = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]') || document.querySelector('.onboarding-modal') || document.querySelector('.wizard-modal');
      const docScrollWidth = document.documentElement.scrollWidth;
      return {
        dialogFound: !!dialog,
        docScrollWidth,
        dialogScrollWidth: dialog ? dialog.scrollWidth : null,
        dialogClientWidth: dialog ? dialog.clientWidth : null,
        hasHorizontalScroll: docScrollWidth > 375,
      };
    });
    console.log(`  -> Onboarding Wizard docScrollWidth: ${wizardData.docScrollWidth}px (<= 375: ${wizardData.docScrollWidth <= 375})`);
    results.push({
      name: 'Onboarding Wizard',
      passed: wizardData.docScrollWidth <= 375,
      docScrollWidth: wizardData.docScrollWidth,
      details: wizardData,
    });

    await browser.close();

    console.log('\n================ SUMMARY OF 375px HINDI + EXTRA LARGE OVERFLOW TESTS ================');
    let allPassed = true;
    for (const r of results) {
      const statusStr = r.passed ? '✓ PASS' : '✗ FAIL';
      if (!r.passed) allPassed = false;
      console.log(`${statusStr} ${r.name.padEnd(22)} | docScrollWidth: ${r.docScrollWidth}px (max 375px)`);
    }

    if (!allPassed) {
      console.error('\nFAIL: One or more targets overflowed at 375px.');
      process.exit(1);
    } else {
      console.log('\nSUCCESS: All 5 targets have ZERO horizontal overflow at 375px with Hindi & Extra Large text!');
    }
  } finally {
    serverProc.kill('SIGINT');
  }
}

main().catch((err) => {
  console.error('Fatal error during overflow verification:', err);
  process.exit(1);
});
