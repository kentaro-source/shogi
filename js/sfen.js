// SFEN の読み込み・書き出し（保存とテスト用）
import { emptyPosition, findKings, makeCode, kindOf, ownerOf, baseOf, isPromoted, HAND_TYPES, SENTE, GOTE } from './rules.js';

const LETTER = { P: 1, L: 2, N: 3, S: 4, G: 5, B: 6, R: 7, K: 8 };
const CHAR = ['', 'P', 'L', 'N', 'S', 'G', 'B', 'R', 'K'];

export function parseSfen(sfen) {
  const [boardPart, turnPart = 'b', handPart = '-'] = sfen.trim().split(/\s+/);
  const pos = emptyPosition();
  const rows = boardPart.split('/');
  if (rows.length !== 9) throw new Error(`SFEN の段の数が 9 でない: ${sfen}`);
  rows.forEach((row, r) => {
    let c = 0, promoted = false;
    for (const ch of row) {
      if (ch === '+') { promoted = true; continue; }
      if (/[1-9]/.test(ch)) { c += Number(ch); continue; }
      const base = LETTER[ch.toUpperCase()];
      if (!base || c > 8) throw new Error(`SFEN の駒が読めない: ${sfen}`);
      pos.board[r * 9 + c] = makeCode(base, ch === ch.toUpperCase() ? SENTE : GOTE, promoted);
      promoted = false;
      c++;
    }
    if (c !== 9) throw new Error(`SFEN の ${r + 1} 段目が 9 マスでない: ${sfen}`);
  });
  pos.turn = turnPart === 'w' ? GOTE : SENTE;
  if (handPart !== '-') {
    let num = '';
    for (const ch of handPart) {
      if (/[0-9]/.test(ch)) { num += ch; continue; }
      const base = LETTER[ch.toUpperCase()];
      if (!base || base === 8) throw new Error(`SFEN の持ち駒が読めない: ${sfen}`);
      pos.hands[ch === ch.toUpperCase() ? SENTE : GOTE][base] += num ? Number(num) : 1;
      num = '';
    }
  }
  return findKings(pos);
}

export function toSfen(pos, moveNumber = 1) {
  const rows = [];
  for (let r = 0; r < 9; r++) {
    let row = '', empty = 0;
    for (let c = 0; c < 9; c++) {
      const p = pos.board[r * 9 + c];
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      const ch = CHAR[isPromoted(p) ? baseOf(p) : kindOf(p)];
      row += (isPromoted(p) ? '+' : '') + (ownerOf(p) === SENTE ? ch : ch.toLowerCase());
    }
    if (empty) row += empty;
    rows.push(row);
  }
  let hand = '';
  for (const owner of [SENTE, GOTE]) {
    for (const t of HAND_TYPES) {
      const n = pos.hands[owner][t];
      if (!n) continue;
      const ch = owner === SENTE ? CHAR[t] : CHAR[t].toLowerCase();
      hand += (n > 1 ? n : '') + ch;
    }
  }
  return `${rows.join('/')} ${pos.turn === SENTE ? 'b' : 'w'} ${hand || '-'} ${moveNumber}`;
}
