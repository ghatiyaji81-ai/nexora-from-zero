import fs from 'node:fs';
import path from 'node:path';

const htmlPath = path.resolve('D:/nexora/nexora-from-zero/.nexora-build/server/app/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const regex = /src="\/_next\/(static\/chunks\/[^"]+\.js)"/g;
let match;
const chunks = new Set();
while ((match = regex.exec(html)) !== null) {
  chunks.add(match[1]);
}

console.log('Scripts loaded by Overview (index.html):');
let total = 0;
for (const chunk of chunks) {
  const filePath = path.resolve('D:/nexora/nexora-from-zero/.nexora-build', chunk);
  if (fs.existsSync(filePath)) {
    const size = fs.statSync(filePath).size;
    total += size;
    console.log(` - ${path.basename(chunk)}: ${(size / 1024).toFixed(1)} KB`);
  }
}
console.log(`Total Initial JS: ${(total / 1024).toFixed(1)} KB (${total} bytes)`);

// Check if @dnd-kit chunk exists and its size
const chunksDir = path.resolve('D:/nexora/nexora-from-zero/.nexora-build/static/chunks');
const files = fs.readdirSync(chunksDir);
console.log('\nAll chunk files in build:');
files.forEach(f => {
  const s = fs.statSync(path.join(chunksDir, f)).size;
  if (s > 10000) {
    console.log(` - ${f}: ${(s / 1024).toFixed(1)} KB`);
  }
});
