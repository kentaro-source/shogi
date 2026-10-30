// 盤・持ち駒台・強調表示の描画
import { kindOf, ownerOf, HAND_TYPES, SENTE, GOTE } from './rules.js';
import { pieceGroup, pieceSvg } from './piece-svg.js';

const PAD = 20, CELL = 100, SIZE = PAD * 2 + CELL * 9;
const BAR_H = 140; // 手番表示とボタンの段の高さ（px）

const $ = (sel) => document.querySelector(sel);
const sqX = (sq) => PAD + (sq % 9) * CELL;
const sqY = (sq) => PAD + ((sq / 9) | 0) * CELL;

// 画面サイズから盤の大きさを決める。持ち駒台は 1 マスぶんの高さ。
// 文字・ボタンは 1 マス 86px（800px 幅の画面）を基準に、大きい画面では拡大する（--ui）
export function layout() {
  const w = window.innerWidth, h = window.innerHeight;
  const margin = Math.max(6, Math.round(w * 0.012));
  const ui = Math.min(1.6, Math.max(1, (w - 2 * margin) / 9 / 86));
  const bar = BAR_H * ui;
  const byHeight = (h - 2 * (bar + 16)) / (1 + 2 / 9);
  const board = Math.floor(Math.min(w - 2 * margin, byHeight));
  const root = document.documentElement.style;
  root.setProperty('--board', `${board}px`);
  root.setProperty('--cell', `${board / 9}px`);
  root.setProperty('--bar-h', `${bar}px`);
  root.setProperty('--ui', String(ui));
}

export function initBoard() {
  const svg = $('#board');
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  let grid = `<rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="10" fill="#e2bd6e"/>`;
  grid += `<g id="hl"></g><g stroke="#1b1208" stroke-width="2.4">`;
  for (let i = 0; i <= 9; i++) {
    const p = PAD + i * CELL;
    const sw = i === 0 || i === 9 ? ' stroke-width="4.5"' : '';
    grid += `<line x1="${PAD}" y1="${p}" x2="${SIZE - PAD}" y2="${p}"${sw}/><line x1="${p}" y1="${PAD}" x2="${p}" y2="${SIZE - PAD}"${sw}/>`;
  }
  grid += '</g><g fill="#1b1208">';
  for (const r of [3, 6]) for (const c of [3, 6]) grid += `<circle cx="${PAD + c * CELL}" cy="${PAD + r * CELL}" r="7"/>`;
  grid += '</g><g id="pieces"></g><g id="marks"></g>';
  svg.innerHTML = grid;
}

// 画面上の点 → マス（盤の外なら -1）
export function squareFromPoint(x, y) {
  const rect = $('#board').getBoundingClientRect();
  const s = rect.width / SIZE;
  const c = Math.floor(((x - rect.left) / s - PAD) / CELL);
  const r = Math.floor(((y - rect.top) / s - PAD) / CELL);
  return r >= 0 && r < 9 && c >= 0 && c < 9 ? r * 9 + c : -1;
}

// マスの中心の画面座標
export function squareCenter(sq) {
  const rect = $('#board').getBoundingClientRect();
  const s = rect.width / SIZE;
  return { x: rect.left + (sqX(sq) + CELL / 2) * s, y: rect.top + (sqY(sq) + CELL / 2) * s, cell: CELL * s };
}

const rect = (sq, attrs) => `<rect x="${sqX(sq)}" y="${sqY(sq)}" width="${CELL}" height="${CELL}" ${attrs}/>`;

export function renderBoard(view) {
  const { game, settings, selection, targets, drag, pending } = view;
  const pos = game.position;
  const result = game.result;

  let hl = '';
  const last = game.lastMove;
  if (last) {
    if (last.from >= 0) hl += rect(last.from, 'class="hl-last"');
    hl += rect(last.to, 'class="hl-last"');
  }
  if (selection && selection.type === 'board') hl += rect(selection.sq, 'class="hl-sel"');
  if (pending) hl += rect(pending.to, 'class="hl-sel"');
  if (!result || result.type === 'mate') {
    for (const side of [SENTE, GOTE]) {
      if (side === pos.turn && game.checks[game.checks.length - 1] && pos.kings[side] >= 0) {
        hl += rect(pos.kings[side], 'class="hl-check"');
      }
    }
  }
  $('#hl').innerHTML = hl;

  let pcs = '';
  for (let sq = 0; sq < 81; sq++) {
    const p = pos.board[sq];
    if (!p) continue;
    const sel = selection && selection.type === 'board' && selection.sq === sq;
    const cls = ['pc'];
    if (sel) cls.push(drag ? 'dragging' : 'lifted');
    pcs += `<g transform="translate(${sqX(sq) + 4} ${sqY(sq) + 4}) scale(0.92)"><g class="${cls.join(' ')}">` +
      `${pieceGroup(kindOf(p), ownerOf(p), { arrows: settings.arrows })}</g></g>`;
  }
  $('#pieces').innerHTML = pcs;

  let marks = '';
  if (targets && settings.targets && !pending) {
    for (const sq of targets.keys()) {
      if (pos.board[sq]) marks += `<rect x="${sqX(sq) + 6}" y="${sqY(sq) + 6}" width="${CELL - 12}" height="${CELL - 12}" rx="8" class="mk-frame"/>`;
      else marks += `<circle cx="${sqX(sq) + CELL / 2}" cy="${sqY(sq) + CELL / 2}" r="17" class="mk-dot"/>`;
    }
  }
  if (drag && drag.hover >= 0 && targets && targets.has(drag.hover)) marks += rect(drag.hover, 'class="mk-hover"');
  $('#marks').innerHTML = marks;
}

// 持ち駒台。駒は台の持ち主から見て正立で描く（奥側は台ごと 180° 回っている）
export function renderHands(view) {
  const { game, settings, selection, drag } = view;
  const pos = game.position;
  for (const owner of [SENTE, GOTE]) {
    let html = '';
    for (const t of HAND_TYPES) {
      const n = pos.hands[owner][t];
      if (!n) continue;
      const sel = selection && selection.type === 'hand' && selection.owner === owner && selection.kind === t;
      const cls = sel ? (drag ? ' dragging' : ' lifted') : '';
      html += `<div class="hand-piece${cls}" data-kind="${t}" data-owner="${owner}">` +
        `${pieceSvg(t, SENTE, { arrows: settings.arrows })}${n > 1 ? `<span class="badge">${n}</span>` : ''}</div>`;
    }
    $(`#side-${owner} .hand`).innerHTML = html;
  }
}

const RESULT_REASON = {
  mate: 'つみ', nomoves: '指せる手がない', sennichite: '千日手', perpetual: '連続王手の千日手',
  resign: 'まいりました', draw: '引き分けにしました',
};
export const resultReason = (result) => RESULT_REASON[result.type];

export function renderSides(view) {
  const { game, roles } = view;
  const pos = game.position;
  const result = game.result;
  const inCheckNow = game.checks[game.checks.length - 1];
  for (const owner of [SENTE, GOTE]) {
    const side = $(`#side-${owner}`);
    const active = !result && pos.turn === owner;
    side.classList.toggle('active', active);
    side.querySelector('.role').textContent = roles[owner];
    side.querySelector('.turn-label').textContent = result ? '' : active ? 'あなたの番' : 'あいての番';
    side.querySelector('.check-label').hidden = !(active && inCheckNow);
    side.querySelector('[data-act="resign"]').disabled = !!result;
    side.querySelector('[data-act="undo"]').disabled = !game.moves.length && !game.manualResult;
  }
}

export function render(view) {
  renderBoard(view);
  renderHands(view);
  renderSides(view);
}

// ドラッグ中に指についてくる駒
export function showDragPiece(kind, owner, x, y, arrows) {
  const layer = $('#drag-layer');
  if (!layer.firstChild) layer.innerHTML = `<div class="drag-piece">${pieceSvg(kind, owner, { arrows })}</div>`;
  const el = layer.firstChild;
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
}

export function hideDragPiece() {
  $('#drag-layer').innerHTML = '';
}

