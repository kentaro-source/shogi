// 起動、状態の保存・復元、Wake Lock、Service Worker の登録
import { Game, moveToUsi, usiToMove } from './rules.js';
import { parseSfen, toSfen } from './sfen.js';
import { handicapById } from './handicap.js';
import { layout, initBoard } from './render.js';
import { initUI } from './ui.js';

const GAME_KEY = 'shogi.game.v1';
const SETTINGS_KEY = 'shogi.settings.v1';

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できなくても対局は続ける */ }
}

// 保存した対局を初期局面から指し直して復元する。読めない手があればそこまで
function restoreGame(saved) {
  if (!saved || typeof saved.initial !== 'string' || !Array.isArray(saved.moves)) return null;
  try {
    const game = new Game(parseSfen(saved.initial));
    for (const u of saved.moves) if (!game.play(usiToMove(u))) break;
    if (saved.manualResult && !game.result) game.manualResult = saved.manualResult;
    return { game, handicapId: handicapById(saved.handicap).id };
  } catch {
    return null;
  }
}

const app = {
  game: null,
  handicapId: 'hirate',
  settings: { arrows: true, targets: true, ...(load(SETTINGS_KEY) || {}) },
  save() {
    store(GAME_KEY, {
      handicap: this.handicapId,
      initial: toSfen(this.game.initial),
      moves: this.game.moves.map(moveToUsi),
      manualResult: this.game.manualResult,
    });
  },
  saveSettings() { store(SETTINGS_KEY, this.settings); },
  newGame(id) {
    const h = handicapById(id);
    this.handicapId = h.id;
    this.game = new Game(parseSfen(h.sfen));
    this.save();
  },
};

const restored = restoreGame(load(GAME_KEY));
if (restored) Object.assign(app, restored);
else app.newGame('hirate');

layout();
initBoard();
const ui = initUI(app);
ui.refresh();
window.addEventListener('resize', () => { layout(); ui.refresh(); });

// 拡大・長押しメニュー・ジェスチャーを止める
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// 画面を消さない
let wakeLock = null;
async function requestWakeLock() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { wakeLock = null; }
}
requestWakeLock();
document.addEventListener('visibilitychange', requestWakeLock);
window.addEventListener('pointerdown', requestWakeLock); // 起動直後に断られたときのために、触れたら取り直す

// 新しい版の Service Worker に切り替わったら読み込み直す（局面は保存済みなのでそのまま再開する）
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
