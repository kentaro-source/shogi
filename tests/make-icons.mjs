// アイコン（駒の絵）を PNG に書き出す: node tests/make-icons.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8125;
const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 0.86, round: true },
  { file: 'icon-512.png', size: 512, scale: 0.86, round: true },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.62, round: false }, // 中央 80% の安全域に収める
];

const server = await startServer(PORT);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await page.goto(`http://localhost:${PORT}/tests/pieces.html`);
  for (const icon of ICONS) {
    await page.evaluate(async ({ size, scale, round }) => {
      const { pieceSvg } = await import('../js/piece-svg.js');
      document.body.innerHTML = '';
      document.body.style.cssText = 'margin:0;background:transparent';
      const box = document.createElement('div');
      box.id = 'icon';
      box.style.cssText = `width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;` +
        `background:#3a2716;border-radius:${round ? size * 0.2 : 0}px`;
      box.innerHTML = pieceSvg(1, 0);
      const svg = box.firstChild;
      svg.style.cssText = `width:${size * scale}px;height:${size * scale}px`;
      document.body.appendChild(box);
    }, icon);
    await page.waitForTimeout(100);
    await page.locator('#icon').screenshot({ path: path.join(ROOT, 'icons', icon.file), omitBackground: true });
    console.log(`icons/${icon.file}`);
  }
} finally {
  await browser.close();
  server.close();
}
