import { chromium } from 'playwright';
async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file:///tmp/opencode/agent_rules_controlplane_preview.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);
  const artboards = await page.evaluate(() => document.querySelectorAll('.artboard').length);
  const overview = await page.evaluate(() => {
    const art = document.querySelector('.artboard[data-name="Desktop / Overview"]');
    if (!art) return null;
    return { name: art.getAttribute('data-name'), texts: art.querySelectorAll('.text').length, nodes: art.querySelectorAll('.node').length };
  });
  console.log(JSON.stringify({ artboards, overview, errors }, null, 2));
  await page.screenshot({ path: '/tmp/opencode/preview-overview.png', clip: { x: 0, y: 0, width: 1440, height: 900 } });
  await browser.close();
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
