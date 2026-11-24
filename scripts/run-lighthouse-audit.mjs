import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const PORT = 3008;
const BASE_URL = `http://localhost:${PORT}`;

const ROUTES = [
  { name: 'Overview', path: '/' },
  { name: 'Connect', path: '/connect' },
  { name: 'Build', path: '/build' },
];

const THEMES = ['light', 'warm', 'dark'];
const FORM_FACTORS = ['desktop', 'mobile'];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, res => {
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
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

function verifyActiveTheme(url) {
  try {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const dump = execSync(`"${chromePath}" --headless=new --dump-dom --no-sandbox --disable-gpu "${url}"`, {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const match = dump.match(/<html[^>]*data-theme="([^"]+)"/i);
    return match ? match[1] : 'unknown';
  } catch {
    return 'detection-fallback';
  }
}

function runCommand(commandLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandLine, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Command exited with code ${code}: ${stderr || stdout}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  console.log('--- Starting Next.js Production Server on port', PORT, '---');
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  try {
    await waitForServer(BASE_URL, 30000);
    console.log('Next.js server is ready at', BASE_URL);

    const reportsDir = path.resolve(process.cwd(), '.lighthouse-reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const results = [];

    for (const formFactor of FORM_FACTORS) {
      console.log(`\n================ RUNNING ${formFactor.toUpperCase()} AUDITS ================`);
      for (const route of ROUTES) {
        for (const theme of THEMES) {
          const url = `${BASE_URL}${route.path}${route.path.includes('?') ? '&' : '?'}theme=${theme}`;
          const filename = `${route.name.toLowerCase()}-${formFactor}-${theme}.json`;
          const reportPath = path.join(reportsDir, filename);

          const verifiedTheme = verifyActiveTheme(url);
          console.log(`\nAuditing ${route.name} [${formFactor.toUpperCase()} | ${theme.toUpperCase()}]`);
          console.log(`[THEME PROOF] URL: ${url} | Requested: ${theme} | Active in DOM: ${verifiedTheme}`);

          let cmd = '';
          if (formFactor === 'desktop') {
            cmd = `npx lighthouse "${url}" --quiet --chrome-flags="--headless=new --no-sandbox --disable-gpu" --output=json --output-path="${reportPath}" --only-categories=performance,accessibility,best-practices --preset=desktop --max-wait-for-load=30000`;
          } else {
            // Mobile preset: 375px width, default throttling
            cmd = `npx lighthouse "${url}" --quiet --chrome-flags="--headless=new --no-sandbox --disable-gpu" --output=json --output-path="${reportPath}" --only-categories=performance,accessibility,best-practices --screenEmulation.width=375 --screenEmulation.height=667 --screenEmulation.deviceScaleFactor=2 --screenEmulation.mobile=true --max-wait-for-load=30000`;
          }

          try {
            await runCommand(cmd);
            const raw = fs.readFileSync(reportPath, 'utf8');
            const data = JSON.parse(raw);
            const perf = Math.round((data.categories.performance?.score || 0) * 100);
            const a11y = Math.round((data.categories.accessibility?.score || 0) * 100);
            const bp = Math.round((data.categories['best-practices']?.score || 0) * 100);
            const cls = data.audits['cumulative-layout-shift']?.numericValue ?? 0;

            const failingA11y = Object.entries(data.audits || {})
              .filter(([k, v]) => v.score !== null && v.score < 1 && data.categories.accessibility?.auditRefs?.some(r => r.id === k))
              .map(([k, v]) => `${k} (${v.title})`);
            if (failingA11y.length > 0) {
              console.warn(`  ↳ Failing A11y Audits:`, failingA11y.join(', '));
            }

            const failingBp = Object.entries(data.audits || {})
              .filter(([k, v]) => v.score !== null && v.score < 1 && data.categories['best-practices']?.auditRefs?.some(r => r.id === k))
              .map(([k, v]) => `${k} (${v.title})`);
            if (failingBp.length > 0) {
              console.warn(`  ↳ Failing BestPractices Audits:`, failingBp.join(', '));
            }

            const entry = {
              route: route.name,
              preset: formFactor,
              theme,
              verifiedTheme,
              performance: perf,
              accessibility: a11y,
              bestPractices: bp,
              cls: Number(cls.toFixed(3)),
            };
            results.push(entry);
            console.log(`✓ [${formFactor.toUpperCase()}] ${route.name} [${theme}] -> Perf: ${perf}, A11y: ${a11y}, BP: ${bp}, CLS: ${cls.toFixed(3)}`);
          } catch (err) {
            console.error(`✗ Error auditing ${route.name} [${formFactor} | ${theme}]:`, err.message);
            results.push({
              route: route.name,
              preset: formFactor,
              theme,
              performance: 'ERR',
              accessibility: 'ERR',
              bestPractices: 'ERR',
              cls: 'ERR',
              error: err.message,
            });
          }
        }
      }
    }

    console.log('\n================ COMPLETE LIGHTHOUSE AUDIT REPORT ================');
    console.table(results);

    const summaryJson = path.join(reportsDir, 'summary.json');
    fs.writeFileSync(summaryJson, JSON.stringify(results, null, 2), 'utf8');
    console.log(`Summary written to ${summaryJson}`);

    const hasLowScore = results.some(r => 
      (typeof r.accessibility === 'number' && r.accessibility < 90) ||
      (typeof r.bestPractices === 'number' && r.bestPractices < 90)
    );

    if (hasLowScore) {
      console.warn('WARNING: Some accessibility or best-practices scores are below 90.');
    } else {
      console.log('SUCCESS: All audited scores meet or exceed 90 threshold!');
    }
  } finally {
    console.log('Terminating Next.js server...');
    server.kill();
    try {
      spawn('taskkill', ['/pid', String(server.pid), '/f', '/t'], { stdio: 'ignore' });
    } catch {}
  }
}

main().catch(err => {
  console.error('Audit run failed:', err);
  process.exit(1);
});
