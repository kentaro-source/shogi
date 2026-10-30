// 平手・駒落ちの初期配置。駒落ちでは上手＝後手（画面上側）で、上手が先に指す。
// 落とす駒の左右は上手から見た向き（左香 = 1一、右香 = 9一、左桂 = 2一）。
import { parseSfen } from './sfen.js';

const LOWER = 'ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL';

export const HANDICAPS = [
  { id: 'hirate', name: '平手', sfen: `lnsgkgsnl/1r5b1/${LOWER} b - 1` },
  { id: 'kyo', name: '香落ち', sfen: `lnsgkgsn1/1r5b1/${LOWER} w - 1` },
  { id: 'migikyo', name: '右香落ち', sfen: `1nsgkgsnl/1r5b1/${LOWER} w - 1` },
  { id: 'kaku', name: '角落ち', sfen: `lnsgkgsnl/1r7/${LOWER} w - 1` },
  { id: 'hisha', name: '飛車落ち', sfen: `lnsgkgsnl/7b1/${LOWER} w - 1` },
  { id: 'hikyo', name: '飛香落ち', sfen: `lnsgkgsn1/7b1/${LOWER} w - 1` },
  { id: 'nimai', name: '二枚落ち', sfen: `lnsgkgsnl/9/${LOWER} w - 1` },
  { id: 'sanmai', name: '三枚落ち', sfen: `lnsgkgsn1/9/${LOWER} w - 1` },
  { id: 'yonmai', name: '四枚落ち', sfen: `1nsgkgsn1/9/${LOWER} w - 1` },
  { id: 'gomai', name: '五枚落ち', sfen: `1nsgkgs2/9/${LOWER} w - 1` },
  { id: 'rokumai', name: '六枚落ち', sfen: `2sgkgs2/9/${LOWER} w - 1` },
  { id: 'hachimai', name: '八枚落ち', sfen: `3gkg3/9/${LOWER} w - 1` },
  { id: 'jumai', name: '十枚落ち', sfen: `4k4/9/${LOWER} w - 1` },
];

export const handicapById = (id) => HANDICAPS.find((h) => h.id === id) || HANDICAPS[0];

export const initialPosition = (id) => parseSfen(handicapById(id).sfen);
