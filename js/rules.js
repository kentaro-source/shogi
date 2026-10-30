// ルールエンジン。DOM・localStorage には触れない（Node でもブラウザでも動く）。
//
// 座標: 盤は 81 マスの配列。index = r * 9 + c
//   r = 0..8 … 一段〜九段（r=0 が後手側＝画面上）
//   c = 0..8 … 9筋〜1筋（c=0 が画面左。筋 = 9 - c）
// 駒コード: 0 = 空き。下位4ビットが種類、16 のビットが後手。
//   1 歩 2 香 3 桂 4 銀 5 金 6 角 7 飛 8 玉
//   9 と 10 成香 11 成桂 12 成銀 14 馬 15 龍（成り = 元の種類 + 8）

export const PAWN = 1, LANCE = 2, KNIGHT = 3, SILVER = 4, GOLD = 5, BISHOP = 6, ROOK = 7, KING = 8;
export const PROMOTE = 8;
export const GOTE_BIT = 16;
export const SENTE = 0, GOTE = 1;

export const HAND_TYPES = [ROOK, BISHOP, GOLD, SILVER, KNIGHT, LANCE, PAWN];

export const kindOf = (code) => code & 15;
export const ownerOf = (code) => (code >> 4) & 1;
export const isPromoted = (code) => (code & 15) > 8;
export const baseOf = (code) => { const k = code & 15; return k > 8 ? k - 8 : k; };
export const makeCode = (base, owner, promoted = false) => (owner ? GOTE_BIT : 0) | (promoted ? base + PROMOTE : base);
export const canPromoteKind = (kind) => kind >= PAWN && kind <= ROOK && kind !== GOLD;

// 駒の動き（駒の持ち主から見た向き。dr = -1 が前）。駒の矢印もこの表から描く。
const GOLD_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH = [[-1, 0], [0, -1], [0, 1], [1, 0]];
export const MOVES = {
  1: { steps: [[-1, 0]], slides: [] },
  2: { steps: [], slides: [[-1, 0]] },
  3: { steps: [[-2, -1], [-2, 1]], slides: [] },
  4: { steps: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]], slides: [] },
  5: { steps: GOLD_STEPS, slides: [] },
  6: { steps: [], slides: DIAG },
  7: { steps: [], slides: ORTH },
  8: { steps: [...DIAG, ...ORTH], slides: [] },
  9: { steps: GOLD_STEPS, slides: [] },
  10: { steps: GOLD_STEPS, slides: [] },
  11: { steps: GOLD_STEPS, slides: [] },
  12: { steps: GOLD_STEPS, slides: [] },
  14: { steps: ORTH, slides: DIAG },
  15: { steps: DIAG, slides: ORTH },
};

// 盤上の 8 方向。index 7-d が d の逆向きになるように並べる。
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const dirIndex = (dr, dc) => DIRS.findIndex(([a, b]) => a === dr && b === dc);

// 駒コードごとの、隣接 1 マスの利きと走り利きの方向（盤上の絶対方向のビット）
const STEP_MASK = new Uint8Array(32);
const SLIDE_MASK = new Uint8Array(32);
// 駒コード × マスごとの移動先（1 マス・桂）と走りの筋
const STEP_TARGETS = [];
const SLIDE_RAYS = [];

const onBoard = (r, c) => r >= 0 && r < 9 && c >= 0 && c < 9;

for (let code = 0; code < 32; code++) {
  STEP_TARGETS[code] = [];
  SLIDE_RAYS[code] = [];
  const mv = MOVES[code & 15];
  if (!mv) continue;
  const sign = ownerOf(code) ? -1 : 1;
  for (const [dr, dc] of mv.steps) {
    const d = dirIndex(dr * sign, dc * sign);
    if (d >= 0) STEP_MASK[code] |= 1 << d;
  }
  for (const [dr, dc] of mv.slides) SLIDE_MASK[code] |= 1 << dirIndex(dr * sign, dc * sign);
  for (let sq = 0; sq < 81; sq++) {
    const r = (sq / 9) | 0, c = sq % 9;
    const steps = [];
    for (const [dr, dc] of mv.steps) {
      const rr = r + dr * sign, cc = c + dc * sign;
      if (onBoard(rr, cc)) steps.push(rr * 9 + cc);
    }
    const rays = [];
    for (const [dr, dc] of mv.slides) {
      const ray = [];
      let rr = r + dr * sign, cc = c + dc * sign;
      while (onBoard(rr, cc)) { ray.push(rr * 9 + cc); rr += dr * sign; cc += dc * sign; }
      if (ray.length) rays.push(ray);
    }
    STEP_TARGETS[code][sq] = steps;
    SLIDE_RAYS[code][sq] = rays;
  }
}

// 持ち主から見た「何段目か」（1 = 最奥の段）
const depthFromFar = (sq, owner) => {
  const r = (sq / 9) | 0;
  return owner === SENTE ? r + 1 : 9 - r;
};
export const inPromotionZone = (sq, owner) => depthFromFar(sq, owner) <= 3;

// その駒がそのマスに成らずにいると、次に動けなくなるか
export const isDeadSquare = (kind, sq, owner) => {
  const d = depthFromFar(sq, owner);
  if (kind === PAWN || kind === LANCE) return d === 1;
  if (kind === KNIGHT) return d <= 2;
  return false;
};

// ---- 局面 ----
// { board: Uint8Array(81), hands: [Uint8Array(8), Uint8Array(8)], turn, kings: [sq, sq] }
// hands[owner][base] = 枚数（base = 1..7）

export function emptyPosition() {
  return { board: new Uint8Array(81), hands: [new Uint8Array(8), new Uint8Array(8)], turn: SENTE, kings: [-1, -1] };
}

export function clonePosition(pos) {
  return {
    board: pos.board.slice(),
    hands: [pos.hands[0].slice(), pos.hands[1].slice()],
    turn: pos.turn,
    kings: pos.kings.slice(),
  };
}

export function findKings(pos) {
  pos.kings = [-1, -1];
  for (let sq = 0; sq < 81; sq++) {
    const p = pos.board[sq];
    if (p && kindOf(p) === KING) pos.kings[ownerOf(p)] = sq;
  }
  return pos;
}

// 千日手判定用のキー（盤・両者の持ち駒・手番）
export function positionKey(pos) {
  let s = String.fromCharCode(...pos.board);
  for (let t = 1; t <= 7; t++) s += String.fromCharCode(pos.hands[0][t] + 40, pos.hands[1][t] + 40);
  return s + pos.turn;
}

// ---- 利き ----

// sq に by 側の駒が利いているか
export function isAttacked(board, sq, by) {
  const r = (sq / 9) | 0, c = sq % 9;
  for (let d = 0; d < 8; d++) {
    const [dr, dc] = DIRS[d];
    const toward = 1 << (7 - d); // 見つかった駒から sq へ向かう方向
    let rr = r + dr, cc = c + dc, first = true;
    while (rr >= 0 && rr < 9 && cc >= 0 && cc < 9) {
      const p = board[rr * 9 + cc];
      if (p) {
        if (ownerOf(p) === by && ((first && (STEP_MASK[p] & toward)) || (SLIDE_MASK[p] & toward))) return true;
        break;
      }
      first = false;
      rr += dr; cc += dc;
    }
  }
  // 桂: by 側の桂が (前に 2・横に 1) 跳んで sq に来られる位置
  const kr = by === SENTE ? r + 2 : r - 2;
  if (kr >= 0 && kr < 9) {
    const knight = makeCode(KNIGHT, by);
    if (c - 1 >= 0 && board[kr * 9 + c - 1] === knight) return true;
    if (c + 1 < 9 && board[kr * 9 + c + 1] === knight) return true;
  }
  return false;
}

export function inCheck(pos, side = pos.turn) {
  const k = pos.kings[side];
  return k >= 0 && isAttacked(pos.board, k, 1 - side);
}

// ---- 指し手 ----
// { from: マス or -1, to: マス, drop: 打つ駒の種類（打つときのみ、それ以外 0）, promote: bool }

export function makeMove(pos, m) {
  const next = clonePosition(pos);
  const me = pos.turn;
  if (m.drop) {
    next.board[m.to] = makeCode(m.drop, me);
    next.hands[me][m.drop]--;
  } else {
    const p = pos.board[m.from];
    const cap = pos.board[m.to];
    if (cap) next.hands[me][baseOf(cap)]++;
    next.board[m.from] = 0;
    next.board[m.to] = m.promote ? p + PROMOTE : p;
    if (kindOf(p) === KING) next.kings[me] = m.to;
  }
  next.turn = 1 - me;
  return next;
}

function addBoardMoves(list, from, to, kind, owner) {
  if (canPromoteKind(kind) && (inPromotionZone(from, owner) || inPromotionZone(to, owner))) {
    list.push({ from, to, drop: 0, promote: true });
    if (!isDeadSquare(kind, to, owner)) list.push({ from, to, drop: 0, promote: false });
  } else {
    list.push({ from, to, drop: 0, promote: false });
  }
}

// 指した後の自玉の安全と打ち歩詰めを除いた候補手
export function pseudoLegalMoves(pos) {
  const { board, turn } = pos;
  const list = [];
  for (let sq = 0; sq < 81; sq++) {
    const p = board[sq];
    if (!p || ownerOf(p) !== turn) continue;
    const kind = kindOf(p);
    for (const t of STEP_TARGETS[p][sq]) {
      const q = board[t];
      if (q && ownerOf(q) === turn) continue;
      addBoardMoves(list, sq, t, kind, turn);
    }
    for (const ray of SLIDE_RAYS[p][sq]) {
      for (const t of ray) {
        const q = board[t];
        if (q && ownerOf(q) === turn) break;
        addBoardMoves(list, sq, t, kind, turn);
        if (q) break;
      }
    }
  }
  const hand = pos.hands[turn];
  let any = false;
  for (let t = 1; t <= 7; t++) if (hand[t]) any = true;
  if (any) {
    const pawnFiles = new Array(9).fill(false); // 成っていない自分の歩がある筋
    const myPawn = makeCode(PAWN, turn);
    for (let sq = 0; sq < 81; sq++) if (board[sq] === myPawn) pawnFiles[sq % 9] = true;
    for (let t = 1; t <= 7; t++) {
      if (!hand[t]) continue;
      for (let sq = 0; sq < 81; sq++) {
        if (board[sq]) continue;
        if (isDeadSquare(t, sq, turn)) continue;
        if (t === PAWN && pawnFiles[sq % 9]) continue;
        list.push({ from: -1, to: sq, drop: t, promote: false });
      }
    }
  }
  return list;
}

// 指した後に自玉が取られる状態にならないか
function leavesKingSafe(pos, m, next) {
  return !inCheck(next, pos.turn);
}

// 王手放置・自殺手のみを除いた手があるか（打ち歩詰めの判定の内側で使う）
function hasSafeMove(pos) {
  for (const m of pseudoLegalMoves(pos)) {
    if (leavesKingSafe(pos, m, makeMove(pos, m))) return true;
  }
  return false;
}

// 打ち歩詰めか（m は歩を打つ手、next はその後の局面）
function isDropPawnMate(pos, m, next) {
  const opp = 1 - pos.turn;
  const front = pos.turn === SENTE ? m.to - 9 : m.to + 9;
  if (front !== pos.kings[opp]) return false;
  return !hasSafeMove(next);
}

export function legalMoves(pos) {
  const out = [];
  for (const m of pseudoLegalMoves(pos)) {
    const next = makeMove(pos, m);
    if (!leavesKingSafe(pos, m, next)) continue;
    if (m.drop === PAWN && isDropPawnMate(pos, m, next)) continue;
    out.push(m);
  }
  return out;
}

export function perft(pos, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(makeMove(pos, m), depth - 1);
  return n;
}

export const sameMove = (a, b) =>
  a.to === b.to && (a.drop || 0) === (b.drop || 0) && (a.drop ? true : a.from === b.from && !!a.promote === !!b.promote);

// ---- USI 形式の指し手（保存用） ----
const USI_PIECE = { 1: 'P', 2: 'L', 3: 'N', 4: 'S', 5: 'G', 6: 'B', 7: 'R' };
const sqToUsi = (sq) => `${9 - (sq % 9)}${String.fromCharCode(97 + ((sq / 9) | 0))}`;
const usiToSq = (s) => (s.charCodeAt(1) - 97) * 9 + (9 - Number(s[0]));

export function moveToUsi(m) {
  if (m.drop) return `${USI_PIECE[m.drop]}*${sqToUsi(m.to)}`;
  return sqToUsi(m.from) + sqToUsi(m.to) + (m.promote ? '+' : '');
}

export function usiToMove(s) {
  if (s[1] === '*') {
    const drop = Number(Object.keys(USI_PIECE).find((k) => USI_PIECE[k] === s[0]));
    return { from: -1, to: usiToSq(s.slice(2, 4)), drop, promote: false };
  }
  return { from: usiToSq(s.slice(0, 2)), to: usiToSq(s.slice(2, 4)), drop: 0, promote: s[4] === '+' };
}

// ---- 対局（手順と各手の後の局面、終局判定） ----
// result: { type, winner }  winner = SENTE | GOTE | null（引き分け）
//   type: 'mate' 詰み / 'nomoves' 指す手がない / 'sennichite' 千日手 /
//         'perpetual' 連続王手の千日手 / 'resign' 投了 / 'draw' 合意の引き分け

export class Game {
  constructor(initial) {
    this.positions = [initial];
    this.keys = [positionKey(initial)];
    this.checks = [inCheck(initial)];
    this.moves = [];
    this.manualResult = null;
    this._legal = null;
    this.derivedResult = this.computeResult();
  }

  get position() { return this.positions[this.positions.length - 1]; }
  get initial() { return this.positions[0]; }
  get result() { return this.manualResult || this.derivedResult; }
  get lastMove() { return this.moves[this.moves.length - 1] || null; }

  legalMoves() {
    if (!this._legal) this._legal = legalMoves(this.position);
    return this._legal;
  }

  // 合法手なら指して true を返す
  play(move) {
    if (this.result) return false;
    const m = this.legalMoves().find((x) => sameMove(x, move));
    if (!m) return false;
    const next = makeMove(this.position, m);
    this.moves.push(m);
    this.positions.push(next);
    this.keys.push(positionKey(next));
    this.checks.push(inCheck(next));
    this._legal = null;
    this.derivedResult = this.computeResult();
    return true;
  }

  // 1 手戻す。投了・合意の引き分けで終わっていたら、まずそれを取り消す
  undo() {
    if (this.manualResult) { this.manualResult = null; return true; }
    if (!this.moves.length) return false;
    this.moves.pop();
    this.positions.pop();
    this.keys.pop();
    this.checks.pop();
    this._legal = null;
    this.derivedResult = this.computeResult();
    return true;
  }

  resign(side) { if (!this.result) this.manualResult = { type: 'resign', winner: 1 - side }; }
  agreeDraw() { if (!this.result) this.manualResult = { type: 'draw', winner: null }; }

  computeResult() {
    const n = this.keys.length - 1;
    const key = this.keys[n];
    let count = 0, first = -1;
    for (let i = 0; i <= n; i++) {
      if (this.keys[i] === key) { if (first < 0) first = i; count++; }
    }
    if (count >= 4) {
      // first から現在までの手で、一方の手がすべて王手だったら、その側の負け
      const allChecks = [true, true];
      const moved = [false, false];
      for (let j = first + 1; j <= n; j++) {
        const mover = this.positions[j - 1].turn;
        moved[mover] = true;
        if (!this.checks[j]) allChecks[mover] = false;
      }
      const s = moved[SENTE] && allChecks[SENTE];
      const g = moved[GOTE] && allChecks[GOTE];
      if (s !== g) return { type: 'perpetual', winner: s ? GOTE : SENTE };
      return { type: 'sennichite', winner: null };
    }
    if (this.legalMoves().length === 0) {
      const pos = this.position;
      return { type: inCheck(pos) ? 'mate' : 'nomoves', winner: 1 - pos.turn };
    }
    return null;
  }
}
