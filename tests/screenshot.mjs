// 縦向きタブレット相当の画面サイズでスクリーンショットを撮る
//   node tests/screenshot.mjs   → tests/screenshots/ に保存
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const PORT = 8124;
const BASE = `http://localhost:${PORT}/`;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots');
const SIZES = [{ width: 800, height: 1280 }, { width: 1200, height: 1920 }];

const HIRATE = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
const MIDGAME = ['7g7f', '3c3d', '8h2b+', '3a2b', '2g2f', '8c8d', '2f2e', '8d8e', '2e2d', '2c2d', '2h2d',
  '8e8f', '8g8f', '8b8f', 'P*8g', '8f8d', '2d2c+', '8d8g+'];

const saved = (initial, moves = [], handicap = 'hirate') => ({ handicap, initial, moves, manualResult: null });

// 局面を localStorage に入れて読み込み直す
async function load(page, game) {
  await page.goto(BASE);
  await page.evaluate((g) => {
    localStorage.clear();
    if (g) localStorage.setItem('shogi.game.v1', JSON.stringify(g));
  }, game);
  await page.reload();
  await page.waitForSelector('#pieces g');
  await page.waitForTimeout(150);
}

// "5e" のマスの中心
async function sq(page, s) {
  return page.evaluate((s) => {
    const r = s.charCodeAt(1) - 97, c = 9 - Number(s[0]);
    const rect = document.querySelector('#board').getBoundingClientRect();
    const k = rect.width / 940;
    return { x: rect.left + (20 + c * 100 + 50) * k, y: rect.top + (20 + r * 100 + 50) * k };
  }, s);
}
async function tap(page, s) {
  const p = await sq(page, s);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(80);
}

const shots = [
  ['01-initial', async (page) => { await load(page, null); }],
  ['02-select', async (page) => { await load(page, null); await tap(page, '7g'); }],
  ['03-midgame-hand', async (page) => {
    await load(page, saved(HIRATE, MIDGAME));
    await page.click('.hand[data-owner="0"] .hand-piece[data-kind="6"]');
  }],
  ['04-drag', async (page) => {
    await load(page, saved(HIRATE, MIDGAME));
    const a = await sq(page, '2c'), b = await sq(page, '3b');
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
  }],
  ['05-promote-sente', async (page) => {
    await load(page, saved('4k4/9/9/4S4/9/9/9/9/4K4 b - 1'));
    await tap(page, '5d'); await tap(page, '5c');
  }],
  ['06-promote-gote', async (page) => {
    await load(page, saved('4k4/9/9/9/4s4/9/9/9/K8 w - 1'));
    await tap(page, '5e'); await tap(page, '5f'); // 5f は相手陣の外なので成れない → そのまま指す
    await tap(page, '9i'); await tap(page, '8i'); // 先手が指してから
    await tap(page, '5f'); await tap(page, '5g'); // 後手の銀が相手陣に入る
  }],
  ['07-check', async (page) => {
    await load(page, saved('4k4/9/9/9/9/9/9/9/R3K4 b - 1'));
    await tap(page, '9i'); await tap(page, '9a');
    await page.click('.promo-btn[data-promote="0"]');
  }],
  ['08-mate', async (page) => {
    await load(page, saved('4k4/9/4P4/9/9/9/9/9/4K4 b G 1'));
    await page.click('.hand[data-owner="0"] .hand-piece[data-kind="5"]');
    await tap(page, '5b');
  }],
  ['09-menu-top', async (page) => {
    await load(page, saved(HIRATE, ['7g7f']));
    await page.click('#side-1 [data-act="menu"]');
  }],
  ['10-handicaps', async (page) => {
    await load(page, null);
    await page.click('#side-0 [data-act="menu"]');
    await page.click('.panel button:has-text("新しい対局")');
  }],
  ['11-handicap-6mai', async (page) => {
    await load(page, saved('2sgkgs2/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1', [], 'rokumai'));
  }],
  ['12-resign-top', async (page) => {
    await load(page, saved(HIRATE, ['7g7f']));
    await page.click('#side-1 [data-act="resign"]');
  }],
  ['13-resigned', async (page) => {
    await load(page, saved(HIRATE, ['7g7f']));
    await page.click('#side-1 [data-act="resign"]');
    await page.click('.panel button:has-text("まいりました")');
  }],
];

fs.mkdirSync(OUT, { recursive: true });
const server = await startServer(PORT);
const browser = await chromium.launch();
const errors = [];
try {
  for (const size of SIZES) {
    const context = await browser.newContext({ viewport: size, hasTouch: false });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${size.width}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${size.width}: ${m.text()}`); });
    const only = process.argv[2];
    for (const [name, run] of shots) {
      if (only && !new RegExp(only).test(name)) continue;
      await run(page);
      await page.waitForTimeout(120);
      const file = path.join(OUT, `${size.width}x${size.height}-${name}.png`);
      await page.screenshot({ path: file });
      await page.mouse.up();
      console.log(path.relative(process.cwd(), file));
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (errors.length) { console.log('エラー:\n' + errors.join('\n')); process.exitCode = 1; }
