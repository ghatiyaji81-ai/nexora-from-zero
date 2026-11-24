import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const PORT = 3008;
const BASE_URL = `http://localhost:${PORT}`;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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
}

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr || stdout)));
    child.on('error', reject);
  });
}

async function main() {
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
    stdio: 'ignore', cwd: process.cwd(),
  });

  try {
    await waitForServer(BASE_URL);
    const url = `${BASE_URL}/?theme=dark`;
    const outPath = path.resolve(process.cwd(), '.lighthouse-reports/overview-desktop-dark-fixed.json');
    console.log('Auditing Overview Desktop Dark with contrast fixes...');
    await runCommand(`npx lighthouse "${url}" --quiet --chrome-flags="--headless=new --no-sandbox --disable-gpu" --output=json --output-path="${outPath}" --only-categories=accessibility,best-practices --preset=desktop --max-wait-for-load=30000`);
    const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const a11y = Math.round((data.categories.accessibility?.score || 0) * 100);
    const bp = Math.round((data.categories['best-practices']?.score || 0) * 100);
    console.log(`✓ Overview [Dark Fixed] -> A11y: ${a11y}, BP: ${bp}`);
  } finally {
    server.kill();
    try { spawn('taskkill', ['/pid', String(server.pid), '/f', '/t'], { stdio: 'ignore' }); } catch {}
  }
}

main().catch(console.error);
