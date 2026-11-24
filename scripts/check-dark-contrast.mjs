import fs from 'fs';
const data = JSON.parse(fs.readFileSync('.lighthouse-reports/overview-desktop-dark.json', 'utf8'));
const audit = data.audits['color-contrast'];
if (audit && audit.details && audit.details.items) {
  console.log(JSON.stringify(audit.details.items.map(i => ({ selector: i.node?.selector, snippet: i.node?.snippet, explanation: i.node?.explanation })), null, 2));
} else {
  console.log('No color contrast items found');
}
