// 駒の SVG（漢字＋動ける方向の矢印）。盤・持ち駒台・成りダイアログで共通に使う。
// 座標は 100×100。駒の持ち主から見て上が前。後手の駒は (50,50) を中心に 180° 回す。
import { MOVES, KING } from './rules.js';

const LABEL = {
  1: '歩', 2: '香', 3: '桂', 4: '銀', 5: '金', 6: '角', 7: '飛',
  9: 'と', 10: '成香', 11: '成桂', 12: '成銀', 14: '馬', 15: '龍',
};
export const pieceLabel = (kind, owner) => (kind === KING ? (owner ? '王' : '玉') : LABEL[kind]);

const BODY = '50,3 83,17 93,97 7,97 17,17';
const CX = 50, CY = 58;
const INK = '#1a1410';
const INK_PROMOTED = '#c62d17';
const ARROW = '#d4381c';
const ARROW_PROMOTED = '#1d43a6';
const FONT = "'Yu Mincho','YuMincho','Hiragino Mincho ProN','Noto Serif CJK JP','Noto Serif JP',serif";

// 方向（画面上の dx, dy）ごとの矢じりの先端。駒の縁から少し内側
const TIP = {
  '0,-1': [50, 14], '1,-1': [77, 31], '-1,-1': [23, 31],
  '1,0': [84, 58], '-1,0': [16, 58],
  '1,1': [80, 88], '-1,1': [20, 88], '0,1': [50, 91],
};

const f = (n) => Math.round(n * 10) / 10;

function head([tx, ty], ux, uy, len, half) {
  const bx = tx - ux * len, by = ty - uy * len;
  const nx = -uy, ny = ux;
  return `${f(tx)},${f(ty)} ${f(bx + nx * half)},${f(by + ny * half)} ${f(bx - nx * half)},${f(by - ny * half)}`;
}

function unit(dx, dy) {
  const l = Math.hypot(dx, dy);
  return [dx / l, dy / l];
}

// 1 マス: 縁の近くに短い三角の矢じりだけ
function stepArrow(dx, dy, color) {
  const [ux, uy] = unit(dx, dy);
  return `<polygon points="${head(TIP[`${dx},${dy}`], ux, uy, 11, 7)}" fill="${color}"/>`;
}

// どこまでも: 中心付近から縁まで伸びる太い線＋大きめの矢じり
function slideArrow(dx, dy, color) {
  const [ux, uy] = unit(dx, dy);
  const tip = TIP[`${dx},${dy}`];
  const sx = CX + ux * 3, sy = CY + uy * 3;
  const ex = tip[0] - ux * 14, ey = tip[1] - uy * 14;
  return `<line x1="${f(sx)}" y1="${f(sy)}" x2="${f(ex)}" y2="${f(ey)}" stroke="${color}" stroke-width="7"/>` +
    `<polygon points="${head(tip, ux, uy, 18, 11)}" fill="${color}"/>`;
}

// 桂の跳び: 前に 2・横に 1 の折れ曲がった矢印を左右に 1 本ずつ
function knightArrows(color) {
  let s = '';
  for (const side of [-1, 1]) {
    const x0 = CX + side * 7;
    const x1 = CX + side * 22;
    s += `<polyline points="${x0},39 ${x0},22 ${x1},22" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round"/>`;
    s += `<polygon points="${head([CX + side * 30, 22], side, 0, 11, 8)}" fill="${color}"/>`;
  }
  return s;
}

function arrowsFor(kind, color) {
  if (kind === 3) return knightArrows(color);
  const mv = MOVES[kind];
  let s = '';
  for (const [dr, dc] of mv.slides) s += slideArrow(dc, dr, color);
  for (const [dr, dc] of mv.steps) s += stepArrow(dc, dr, color);
  return s;
}

function labelText(label, color) {
  const attrs = `text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-weight="700" fill="${color}" stroke="#f3dca6" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round"`;
  if (label.length === 1) return `<text x="${CX}" y="${CY}" font-size="34" ${attrs}>${label}</text>`;
  return `<text x="${CX}" y="${CY - 13}" font-size="23" ${attrs}>${label[0]}</text>` +
    `<text x="${CX}" y="${CY + 9}" font-size="23" ${attrs}>${label[1]}</text>`;
}

// 駒 1 枚ぶんの SVG 要素（<g>）。kind は rules.js の駒の種類（成りを含む）
export function pieceGroup(kind, owner, { arrows = true } = {}) {
  const promoted = kind > 8;
  const body = `<polygon points="${BODY}" fill="#f3dca6" stroke="#8d6b33" stroke-width="2" stroke-linejoin="round"/>`;
  const arrowSvg = arrows ? arrowsFor(kind, promoted ? ARROW_PROMOTED : ARROW) : '';
  const text = labelText(pieceLabel(kind, owner), promoted ? INK_PROMOTED : INK);
  const rot = owner ? ' transform="rotate(180 50 50)"' : '';
  return `<g class="piece"${rot}>${body}${arrowSvg}${text}</g>`;
}

// 単独で置く <svg>（持ち駒台・ダイアログ用）
export function pieceSvg(kind, owner, opts = {}) {
  return `<svg class="piece-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="${pieceLabel(kind, owner)}">${pieceGroup(kind, owner, opts)}</svg>`;
}
