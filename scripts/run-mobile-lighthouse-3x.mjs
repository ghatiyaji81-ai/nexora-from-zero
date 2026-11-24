import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const PORT = 3014;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const ROUTES = [
  { name: 'Overview', path: '/' },
  { name: 'Connect', path: '/connect' },
  { name: 'Build', path: '/build' },
];

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

function runCommand(commandLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandLine, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`Command failed with code ${code}: ${stderr}`));
    });
  });
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main() {
  console.log(`Starting production Next.js server on port ${PORT}...`);
  const serverProc = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  const reportsDir = path.resolve(process.cwd(), '.lighthouse-reports-mobile-3x');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  try {
    await waitForServer(BASE_URL);
    console.log(`Server ready at ${BASE_URL}`);

    const allResults = [];

    for (const route of ROUTES) {
      console.log(`\n======================================================`);
      console.log(`AUDITING ROUTE: ${route.name} (${route.path}) [MOBILE PRESET - 3 RUNS]`);
      console.log(`======================================================`);

      const routeRuns = [];

      for (let run = 1; run <= 3; run++) {
        const url = `${BASE_URL}${route.path}`;
        const filename = `${route.name.toLowerCase()}-mobile-run${run}.json`;
        const reportPath = path.join(reportsDir, filename);

        console.log(`\nStarting Run #${run} for ${route.name}...`);
        const cmd = `npx lighthouse "${url}" --quiet --chrome-flags="--headless=new --no-sandbox --disable-gpu" --output=json --output-path="${reportPath}" --only-categories=performance,accessibility,best-practices --screenEmulation.width=375 --screenEmulation.height=667 --screenEmulation.deviceScaleFactor=2 --screenEmulation.mobile=true --max-wait-for-load=35000`;

        await runCommand(cmd);

        const raw = fs.readFileSync(reportPath, 'utf8');
        const data = JSON.parse(raw);

        const perf = Math.round((data.categories.performance?.score || 0) * 100);
        const a11y = Math.round((data.categories.accessibility?.score || 0) * 100);
        const bp = Math.round((data.categories['best-practices']?.score || 0) * 100);
        const lcpMs = Math.round(data.audits['largest-contentful-paint']?.numericValue || 0);
        const tbtMs = Math.round(data.audits['total-blocking-time']?.numericValue || 0);
        const cls = Number((data.audits['cumulative-layout-shift']?.numericValue || 0).toFixed(3));

        // Calculate JS transfer bytes from network-requests
        let jsBytes = 0;
        const netItems = data.audits['network-requests']?.details?.items || [];
        for (const item of netItems) {
          if (item.resourceType === 'Script') {
            jsBytes += item.transferSize || 0;
          }
        }
        if (jsBytes === 0) {
          jsBytes = data.audits['total-byte-weight']?.numericValue || 0;
        }

        const runData = {
          run,
          route: route.name,
          performance: perf,
          accessibility: a11y,
          bestPractices: bp,
          lcpMs,
          tbtMs,
          cls,
          jsBytes,
        };

        routeRuns.push(runData);
        console.log(`  Run #${run} Results:`);
        console.log(`    Performance:    ${perf} / 100`);
        console.log(`    Accessibility:  ${a11y} / 100`);
        console.log(`    Best Practices: ${bp} / 100`);
        console.log(`    LCP:            ${lcpMs} ms`);
        console.log(`    TBT:            ${tbtMs} ms`);
        console.log(`    CLS:            ${cls}`);
        console.log(`    JS Bytes:       ${(jsBytes / 1024).toFixed(1)} KB (${jsBytes} bytes)`);

        await sleep(3500); // pause between runs for thermal cooling and CPU normalization
      }

      // Compute median for this route
      const medianPerf = median(routeRuns.map((r) => r.performance));
      const medianA11y = median(routeRuns.map((r) => r.accessibility));
      const medianBp = median(routeRuns.map((r) => r.bestPractices));
      const medianLcp = median(routeRuns.map((r) => r.lcpMs));
      const medianTbt = median(routeRuns.map((r) => r.tbtMs));
      const medianCls = median(routeRuns.map((r) => r.cls));
      const medianJsKb = (median(routeRuns.map((r) => r.jsBytes)) / 1024).toFixed(1);

      console.log(`\n>>> ${route.name.toUpperCase()} 3-RUN MEDIAN: Perf: ${medianPerf} | A11y: ${medianA11y} | BP: ${medianBp} | LCP: ${medianLcp}ms | TBT: ${medianTbt}ms | CLS: ${medianCls} | JS: ${medianJsKb}KB <<<`);

      allResults.push({
        route: route.name,
        runs: routeRuns,
        median: {
          performance: medianPerf,
          accessibility: medianA11y,
          bestPractices: medianBp,
          lcpMs: medianLcp,
          tbtMs: medianTbt,
          cls: medianCls,
          jsKb: medianJsKb,
        },
      });
    }

    console.log(`\n========================================================================`);
    console.log(`FINAL MOBILE 3-RUN SUMMARY TABLE (MEDIANS)`);
    console.log(`========================================================================`);
    console.log(`Route      | Perf (Median) | A11y (Median) | BP (Median) | LCP (ms) | TBT (ms) | CLS   | JS (KB)`);
    console.log(`-----------+---------------+---------------+-------------+----------+----------+-------+--------`);
    for (const res of allResults) {
      const m = res.median;
      console.log(
        `${res.route.padEnd(10)} | ${String(m.performance).padStart(13)} | ${String(m.accessibility).padStart(13)} | ${String(m.bestPractices).padStart(11)} | ${String(m.lcpMs).padStart(8)} | ${String(m.tbtMs).padStart(8)} | ${String(m.cls).padStart(5)} | ${String(m.jsKb).padStart(6)}`
      );
    }
    console.log(`========================================================================`);

    // Write summary JSON
    fs.writeFileSync(
      path.join(reportsDir, 'mobile-summary-3x.json'),
      JSON.stringify(allResults, null, 2)
    );
  } finally {
    serverProc.kill('SIGINT');
  }
}

main().catch((err) => {
  console.error('Fatal error during 3x mobile Lighthouse audit:', err);
  process.exit(1);
});
