import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  perft, legalMoves, makeMove, inCheck, Game, usiToMove, moveToUsi,
  PAWN, LANCE, KNIGHT, SILVER, GOLD, BISHOP, ROOK, KING, SENTE, GOTE,
  kindOf, ownerOf, baseOf,
} from '../js/rules.js';
import { parseSfen, toSfen } from '../js/sfen.js';
import { HANDICAPS, initialPosition } from '../js/handicap.js';

// "5e" のような表記をマス番号に
const sq = (s) => (s.charCodeAt(1) - 97) * 9 + (9 - Number(s[0]));
const usis = (pos) => legalMoves(pos).map(moveToUsi);

function playAll(game, list) {
  for (const u of list) assert.ok(game.play(usiToMove(u)), `指せない手: ${u}`);
}

test('perft: 平手の初期局面から深さ1〜4', () => {
  const pos = initialPosition('hirate');
  assert.equal(perft(pos, 1), 30);
  assert.equal(perft(pos, 2), 900);
  assert.equal(perft(pos, 3), 25470);
  assert.equal(perft(pos, 4), 719731);
});

test('二歩は候補に出ない（と金のある筋には打てる）', () => {
  // 5筋に先手の歩、3筋に先手のと金
  const pos = parseSfen('4k4/9/9/9/9/4P1+P2/9/9/4K4 b P 1');
  const drops = usis(pos).filter((u) => u.startsWith('P*'));
  assert.ok(drops.length > 0);
  assert.ok(!drops.some((u) => u[2] === '5'), '5筋に歩を打てている');
  assert.ok(drops.some((u) => u[2] === '3'), '3筋（と金だけ）に歩を打てない');
});

test('打ち歩詰めは候補に出ない', () => {
  // 後手玉 1一、後手香 2一、先手金 2三。▲1二歩打は詰みになるので反則
  const pos = parseSfen('7lk/9/7G1/9/9/9/9/9/4K4 b P 1');
  const list = usis(pos);
  assert.ok(!list.includes('P*1b'), '打ち歩詰めが候補に出ている');
  assert.ok(list.includes('P*1c'), '王手にならない歩打ちまで消えている');
});

test('歩を突いての詰みは指せて、詰みと判定される', () => {
  const g = new Game(parseSfen('7lk/9/7GP/9/9/9/9/9/4K4 b - 1'));
  assert.ok(usis(g.position).includes('1c1b'));
  playAll(g, ['1c1b']);
  assert.deepEqual(g.result, { type: 'mate', winner: SENTE });
});

test('行き所のない駒: 打てない・成らずに動けない', () => {
  // 先手: 歩 3二、香 1二、桂 7三・4四。持ち駒 歩・香・桂
  const pos = parseSfen('k8/6P1L/2N6/5N3/9/9/9/9/4K4 b PLN 1');
  const list = usis(pos);
  for (const u of ['3b3a', '1b1a', '7c8a', '7c6a', '4d5b']) {
    assert.ok(!list.includes(u), `成らずの ${u} が候補に出ている`);
    assert.ok(list.includes(u + '+'), `成る ${u}+ が候補にない`);
  }
  const drops = list.filter((u) => u[1] === '*');
  assert.ok(!drops.some((u) => (u[0] === 'P' || u[0] === 'L') && u[3] === 'a'), '歩・香を一段目に打てている');
  assert.ok(!drops.some((u) => u[0] === 'N' && (u[3] === 'a' || u[3] === 'b')), '桂を一・二段目に打てている');
  assert.ok(drops.includes('P*5b') && drops.includes('L*5b') && drops.includes('N*5c'));
});

test('自殺手・ピンされた駒の横移動は候補に出ない', () => {
  // 先手玉 5九、先手金 5八、後手飛 5一（金はピンされている）
  const pos = parseSfen('4r3k/9/9/9/9/9/9/4G4/4K4 b - 1');
  const goldMoves = usis(pos).filter((u) => u.startsWith('5h'));
  assert.deepEqual(goldMoves.sort(), ['5h5g']);
  for (const m of legalMoves(pos)) assert.ok(!inCheck(makeMove(pos, m), SENTE));
});

test('王手放置は候補に出ない', () => {
  // 先手玉 5九に後手飛 5一から王手。1九の銀の手は王手を防げない
  const pos = parseSfen('4r3k/9/9/9/9/9/9/9/4K3S b - 1');
  assert.ok(inCheck(pos));
  const list = usis(pos);
  assert.ok(!list.some((u) => u.startsWith('1i')), '王手と無関係の銀の手が出ている');
  assert.ok(list.length > 0 && list.every((u) => u.startsWith('5i')));
  assert.ok(!list.includes('5i5h'), '飛車の利きに玉が動けている');
});

test('頭金で詰みと判定される', () => {
  const g = new Game(parseSfen('4k4/9/4P4/9/9/9/9/9/4K4 b G 1'));
  assert.equal(g.result, null);
  playAll(g, ['G*5b']);
  assert.deepEqual(g.result, { type: 'mate', winner: SENTE });
});

test('王手でない局面で詰みと判定されない', () => {
  assert.equal(new Game(initialPosition('hirate')).result, null);
  // 王手ではないが玉が身動きしにくい局面
  const g = new Game(parseSfen('k8/2G6/1P7/9/9/9/9/9/4K4 w - 1'));
  assert.ok(!inCheck(g.position));
  assert.equal(g.result, null);
});

test('千日手（通常）は引き分け', () => {
  const g = new Game(parseSfen('4k4/9/9/9/9/9/9/9/4K4 b - 1'));
  const cycle = ['5i4i', '5a4a', '4i5i', '4a5a'];
  playAll(g, [...cycle, ...cycle, ...cycle.slice(0, 3)]);
  assert.equal(g.result, null, '同一局面3回で終局している');
  playAll(g, [cycle[3]]);
  assert.deepEqual(g.result, { type: 'sennichite', winner: null });
});

test('連続王手の千日手は王手をかけ続けた側の負け', () => {
  // 先手飛 2六 が 1筋・2筋を行き来して王手をかけ続ける
  const g = new Game(parseSfen('8k/9/9/9/9/7R1/9/9/4K4 b - 1'));
  const cycle = ['2f1f', '1a2a', '1f2f', '2a1a'];
  playAll(g, [...cycle, ...cycle, ...cycle]);
  assert.deepEqual(g.result, { type: 'perpetual', winner: GOTE });
});

test('成り: 相手陣に入る・相手陣から出る・相手陣の中で動く', () => {
  const both = (sfen, u) => {
    const list = usis(parseSfen(sfen));
    return list.includes(u) && list.includes(u + '+');
  };
  assert.ok(both('k8/9/9/4S4/9/9/9/9/4K4 b - 1', '5d5c'), '入る');
  assert.ok(both('k8/9/4S4/9/9/9/9/9/4K4 b - 1', '5c6d'), '出る');
  assert.ok(both('k8/4S4/9/9/9/9/9/9/4K4 b - 1', '5b5a'), '中で動く');
  // 相手陣と関係のない動きでは成れない
  const list = usis(parseSfen('k8/9/9/9/4S4/9/9/9/4K4 b - 1'));
  assert.ok(list.includes('5e5d') && !list.includes('5e5d+'));
  // 後手も同様（後手の相手陣は七〜九段）
  assert.ok(both('4k4/9/9/9/9/4s4/9/9/K8 w - 1', '5f5g'));
  // 金・玉・成った駒には成る手がない
  assert.ok(!usis(parseSfen('k8/9/4G4/9/9/9/9/9/4K4 b - 1')).some((u) => u.endsWith('+')));
});

test('全手合いの初期配置: 上手・下手の駒の数と種類', () => {
  const full = { [PAWN]: 9, [LANCE]: 2, [KNIGHT]: 2, [SILVER]: 2, [GOLD]: 2, [BISHOP]: 1, [ROOK]: 1, [KING]: 1 };
  const removed = {
    hirate: [], kyo: [LANCE], migikyo: [LANCE], kaku: [BISHOP], hisha: [ROOK], hikyo: [ROOK, LANCE],
    nimai: [ROOK, BISHOP], sanmai: [ROOK, BISHOP, LANCE], yonmai: [ROOK, BISHOP, LANCE, LANCE],
    gomai: [ROOK, BISHOP, LANCE, LANCE, KNIGHT], rokumai: [ROOK, BISHOP, LANCE, LANCE, KNIGHT, KNIGHT],
    hachimai: [ROOK, BISHOP, LANCE, LANCE, KNIGHT, KNIGHT, SILVER, SILVER],
    jumai: [ROOK, BISHOP, LANCE, LANCE, KNIGHT, KNIGHT, SILVER, SILVER, GOLD, GOLD],
  };
  assert.equal(HANDICAPS.length, 13);
  for (const h of HANDICAPS) {
    const pos = initialPosition(h.id);
    const count = [{}, {}];
    for (const p of pos.board) if (p) count[ownerOf(p)][kindOf(p)] = (count[ownerOf(p)][kindOf(p)] || 0) + 1;
    const expectUwate = { ...full };
    for (const t of removed[h.id]) expectUwate[t]--;
    for (const t of Object.keys(expectUwate)) if (!expectUwate[t]) delete expectUwate[t];
    assert.deepEqual(count[SENTE], full, `${h.name}: 下手の駒`);
    assert.deepEqual(count[GOTE], expectUwate, `${h.name}: 上手の駒`);
    assert.equal(pos.turn, h.id === 'hirate' ? SENTE : GOTE, `${h.name}: 先に指す側`);
    assert.ok(pos.hands.every((hand) => hand.every((n) => n === 0)));
  }
  // 落とす駒の位置（上手から見た左右）
  assert.equal(initialPosition('kyo').board[sq('1a')], 0);
  assert.notEqual(initialPosition('kyo').board[sq('9a')], 0);
  assert.equal(initialPosition('migikyo').board[sq('9a')], 0);
  assert.notEqual(initialPosition('migikyo').board[sq('1a')], 0);
  assert.equal(initialPosition('gomai').board[sq('2a')], 0);
  assert.equal(baseOf(initialPosition('gomai').board[sq('8a')]), KNIGHT);
});

test('SFEN の読み込み→書き出しで元に戻る', () => {
  const list = [
    'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    '8l/1l+R2P3/p2pBG1pp/kps1p4/Nn1P2G2/P1P1P2PP/1PS6/1KSG3+r1/LN2+p3L w Sbgn3p 124',
    '4k4/9/9/9/9/9/9/9/4K4 b 2R2B4G4S4N4L18P 1',
    ...HANDICAPS.map((h) => h.sfen),
  ];
  for (const s of list) assert.equal(toSfen(parseSfen(s), Number(s.split(' ')[3])), s);
});

test('待った: 1手ずつ戻り、初期局面より前には戻らない。投了は取り消せる', () => {
  const g = new Game(initialPosition('hirate'));
  playAll(g, ['7g7f', '3c3d']);
  assert.ok(g.undo());
  assert.equal(g.moves.length, 1);
  assert.ok(g.undo());
  assert.ok(!g.undo());
  assert.equal(toSfen(g.position), HANDICAPS[0].sfen);
  playAll(g, ['7g7f']);
  g.resign(GOTE);
  assert.deepEqual(g.result, { type: 'resign', winner: SENTE });
  assert.ok(!g.play(usiToMove('3c3d')), '終局後に指せている');
  assert.ok(g.undo());
  assert.equal(g.result, null);
  assert.equal(g.moves.length, 1);
});
