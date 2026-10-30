// 入力処理、ダイアログ、メニュー
import { kindOf, ownerOf, SENTE, GOTE, PROMOTE } from './rules.js';
import { render, squareFromPoint, squareCenter, showDragPiece, hideDragPiece, resultReason, fitButtonText } from './render.js';
import { pieceSvg } from './piece-svg.js';
import { HANDICAPS } from './handicap.js';

const DRAG_START_PX = 10;
const $ = (sel) => document.querySelector(sel);

// app: { game, handicapId, settings, save(), saveSettings(), newGame(id) }
export function initUI(app) {
  // selection: null | { type: 'board', sq } | { type: 'hand', owner, kind }
  // targets: Map<マス, 指し手[]>（成る・成らないの 2 通りがあれば 2 つ）
  const view = { selection: null, targets: null, drag: null, pending: null };
  let pointer = null; // 追っている指（最初に触れた 1 本だけ）
  let modal = null; // 開いているダイアログ

  const roles = () => (app.handicapId === 'hirate' ? ['先手', '後手'] : ['下手', '上手']);

  function refresh() {
    Object.assign(view, { game: app.game, settings: app.settings, roles: roles() });
    render(view);
    renderResult();
    fitButtonText();
  }

  function select(sel) {
    view.selection = sel;
    view.targets = null;
    if (!sel) return;
    const map = new Map();
    for (const m of app.game.legalMoves()) {
      const hit = sel.type === 'board' ? !m.drop && m.from === sel.sq : m.drop === sel.kind;
      if (!hit) continue;
      if (!map.has(m.to)) map.set(m.to, []);
      map.get(m.to).push(m);
    }
    view.targets = map;
  }

  const sameSel = (a, b) => !!a && !!b && a.type === b.type &&
    (a.type === 'board' ? a.sq === b.sq : a.owner === b.owner && a.kind === b.kind);

  function selectedPiece(sel) {
    if (sel.type === 'hand') return { kind: sel.kind, owner: sel.owner };
    const p = app.game.position.board[sel.sq];
    return { kind: kindOf(p), owner: ownerOf(p) };
  }

  function hitAt(e) {
    const handEl = e.target.closest('.hand-piece');
    if (handEl) return { type: 'hand', kind: Number(handEl.dataset.kind), owner: Number(handEl.dataset.owner) };
    if (e.target.closest('#board')) {
      const sq = squareFromPoint(e.clientX, e.clientY);
      if (sq >= 0) return { type: 'board', sq };
    }
    const side = e.target.closest('.side');
    return { type: 'outside', owner: side ? Number(side.dataset.owner) : null };
  }

  // ---- 盤・持ち駒台の操作 ----

  function onDown(e) {
    if (pointer || modal || e.button > 0) return;
    if (e.target.closest('button')) return;
    const game = app.game;
    if (game.result) return;
    const turn = game.position.turn;
    const hit = hitAt(e);
    const p = hit.type === 'board' ? game.position.board[hit.sq] : 0;
    const own = (hit.type === 'hand' && hit.owner === turn) || (hit.type === 'board' && p && ownerOf(p) === turn);

    if (own) {
      const wasSelected = sameSel(view.selection, hit);
      select(hit);
      pointer = { id: e.pointerId, x0: e.clientX, y0: e.clientY, mode: 'piece', wasSelected, moved: false };
    } else if (hit.type === 'board' && view.targets && view.targets.has(hit.sq)) {
      pointer = { id: e.pointerId, mode: 'target', sq: hit.sq };
      return;
    } else if (hit.type === 'board' && !p) {
      select(null); // 移動先でない空きマス
    } else if (hit.type === 'outside' && (hit.owner === null || hit.owner === turn)) {
      select(null); // 盤の外（手番でない側のエリアは無視）
    } else {
      return; // 相手の駒・手番でない側の持ち駒は何も起きない
    }
    refresh();
  }

  function onMove(e) {
    if (!pointer || e.pointerId !== pointer.id || pointer.mode !== 'piece') return;
    if (!pointer.moved) {
      if (Math.hypot(e.clientX - pointer.x0, e.clientY - pointer.y0) < DRAG_START_PX) return;
      pointer.moved = true;
      view.drag = { hover: -1 };
    }
    const { kind, owner } = selectedPiece(view.selection);
    showDragPiece(kind, owner, e.clientX, e.clientY, app.settings.arrows);
    const hover = squareFromPoint(e.clientX, e.clientY);
    if (hover !== view.drag.hover || !pointer.drawn) {
      view.drag.hover = hover;
      pointer.drawn = true;
      refresh();
    }
  }

  function onUp(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    const p = pointer;
    pointer = null;
    const sq = squareFromPoint(e.clientX, e.clientY);
    if (p.mode === 'target') {
      if (sq === p.sq) tryMove(sq);
    } else if (p.moved) {
      hideDragPiece();
      view.drag = null;
      const sel = view.selection;
      if (sq >= 0 && view.targets.has(sq)) tryMove(sq);
      else if (!(sel.type === 'board' && sel.sq === sq)) select(null); // 合法でないマスで離したら元に戻す
    } else if (p.wasSelected) {
      select(null); // 同じ駒をもう一度タップ
    }
    refresh();
  }

  function onCancel(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    pointer = null;
    hideDragPiece();
    view.drag = null;
    select(null);
    refresh();
  }

  function tryMove(sq) {
    const moves = view.targets.get(sq);
    if (moves.length === 1) commit(moves[0]);
    else askPromotion(moves);
  }

  function commit(m) {
    app.game.play(m);
    select(null);
    view.pending = null;
    app.save();
  }

  // ---- ダイアログ ----

  // owner 側の人に向けた画面中央寄りの位置に出すパネル
  function openModal(owner, html, { onOutside, place } = {}) {
    closeModal();
    const ov = document.createElement('div');
    ov.className = 'overlay';
    const panel = document.createElement('div');
    panel.className = `panel${owner === GOTE ? ' flip' : ''}`;
    panel.innerHTML = html;
    ov.appendChild(panel);
    $('#overlay-root').appendChild(ov);
    fitButtonText(panel);
    const pos = place ? place(panel) : { x: window.innerWidth / 2, y: window.innerHeight * (owner === GOTE ? 0.3 : 0.7) };
    panel.style.left = `${pos.x}px`;
    panel.style.top = `${pos.y}px`;
    ov.addEventListener('click', (e) => {
      if (e.target !== ov) return;
      closeModal();
      if (onOutside) onOutside();
      refresh();
    });
    modal = ov;
    if (pointer) onCancel({ pointerId: pointer.id });
    return panel;
  }

  function closeModal() {
    if (modal) modal.remove();
    modal = null;
  }

  // buttons: [{ label, cls, act, keep }]。act の後にダイアログを閉じる（keep なら閉じない）
  function dialog(owner, { title, text, buttons, onOutside }) {
    const html = (title ? `<div class="panel-title">${title}</div>` : '') +
      (text ? `<div class="panel-text">${text}</div>` : '') +
      `<div class="panel-buttons">${buttons.map((b, i) =>
        `<button class="btn ${b.cls || ''}" data-i="${i}"${b.disabled ? ' disabled' : ''}>${b.label}</button>`).join('')}</div>`;
    const panel = openModal(owner, html, { onOutside });
    panel.querySelectorAll('button[data-i]').forEach((el) => {
      el.addEventListener('click', () => {
        const b = buttons[Number(el.dataset.i)];
        if (!b.keep) closeModal();
        if (b.act) b.act(el);
        refresh();
      });
    });
    return panel;
  }

  function confirmDialog(owner, text, okLabel, act) {
    dialog(owner, { text, buttons: [{ label: okLabel, cls: 'primary', act }, { label: 'やめる' }] });
  }

  // 成る・成らない。指した人の側に向けて、移動先のマスの近くに出す
  function askPromotion(moves) {
    const game = app.game;
    const mover = game.position.turn;
    const m0 = moves[0];
    const kind = kindOf(game.position.board[m0.from]);
    view.pending = { to: m0.to };
    const yes = moves.find((m) => m.promote), no = moves.find((m) => !m.promote);
    const opt = (k, label) => `<button class="promo-btn" data-promote="${k > 8 ? 1 : 0}">` +
      `${pieceSvg(k, SENTE, { arrows: app.settings.arrows })}<span>${label}</span></button>`;
    const html = `<div class="promo">${opt(kind + PROMOTE, '成る')}${opt(kind, '成らない')}</div>`;
    const panel = openModal(mover, html, {
      onOutside: () => { view.pending = null; select(null); },
      place: (el) => {
        const c = squareCenter(m0.to);
        const w = el.offsetWidth, h = el.offsetHeight;
        const dir = mover === SENTE ? 1 : -1; // 指した人の側へずらす
        let y = c.y + dir * (c.cell / 2 + h / 2 + 8);
        if (y + h / 2 > window.innerHeight - 4 || y - h / 2 < 4) y = c.y - dir * (c.cell / 2 + h / 2 + 8);
        const x = Math.min(Math.max(c.x, w / 2 + 8), window.innerWidth - w / 2 - 8);
        return { x, y };
      },
    });
    panel.querySelectorAll('.promo-btn').forEach((el) => {
      el.addEventListener('click', () => {
        closeModal();
        commit(el.dataset.promote === '1' ? yes : no);
        refresh();
      });
    });
    refresh();
  }

  function openMenu(owner) {
    const s = app.settings;
    const onoff = (v) => (v ? 'ON' : 'OFF');
    dialog(owner, {
      title: 'メニュー',
      buttons: [
        { label: '新しい対局', act: () => openHandicaps(owner) },
        {
          label: '引き分けにする', disabled: !!app.game.result,
          act: () => confirmDialog(owner, '引き分けにして終わりますか？', '引き分けにする', () => { app.game.agreeDraw(); app.save(); }),
        },
        {
          label: `矢印の表示：${onoff(s.arrows)}`, keep: true,
          act: (el) => { s.arrows = !s.arrows; el.textContent = `矢印の表示：${onoff(s.arrows)}`; app.saveSettings(); },
        },
        {
          label: `移動先の表示：${onoff(s.targets)}`, keep: true,
          act: (el) => { s.targets = !s.targets; el.textContent = `移動先の表示：${onoff(s.targets)}`; app.saveSettings(); },
        },
        { label: '閉じる', cls: 'secondary' },
      ],
    });
  }

  function openHandicaps(owner) {
    const html = `<div class="panel-title">手合いを選ぶ</div><div class="handicap-list">${HANDICAPS.map((h) =>
      `<button class="btn${h.id === 'hirate' ? ' primary' : ''}" data-id="${h.id}">${h.name}</button>`).join('')}</div>` +
      '<div class="panel-buttons"><button class="btn secondary" data-back>やめる</button></div>';
    const panel = openModal(owner, html);
    panel.querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => {
      closeModal();
      startNewGame(el.dataset.id);
    }));
    panel.querySelector('[data-back]').addEventListener('click', () => { closeModal(); refresh(); });
  }

  function startNewGame(id) {
    app.newGame(id);
    select(null);
    view.pending = null;
    refresh();
  }

  function undo() {
    if (!app.game.undo()) return;
    select(null);
    view.pending = null;
    app.save();
    refresh();
  }

  // ---- 終局表示（両者それぞれの向き。盤を隠さないよう、盤の外側に接して持ち駒台に重ねる） ----
  function renderResult() {
    const layer = $('#result-layer');
    const result = app.game.result;
    if (!result) { layer.innerHTML = ''; layer.hidden = true; return; }
    const reason = resultReason(result);
    const key = `${result.type}:${result.winner}:${app.game.moves.length}`;
    if (layer.dataset.key !== key || layer.hidden) {
      layer.dataset.key = key;
      layer.innerHTML = [SENTE, GOTE].map((owner) => {
        const word = result.winner === null ? 'ひきわけ' : result.winner === owner ? 'かち' : 'まけ';
        const cls = result.winner === null ? 'draw' : result.winner === owner ? 'win' : 'lose';
        return `<div class="panel result${owner === GOTE ? ' flip' : ''}" data-owner="${owner}">` +
          `<div class="result-text"><div class="result-word ${cls}">${word}</div><div class="result-reason">${reason}</div></div>` +
          '<div class="panel-buttons"><button class="btn" data-act="undo">待った</button>' +
          '<button class="btn primary" data-act="again">もう一局</button></div></div>';
      }).join('');
    }
    layer.hidden = false;
    for (const el of layer.querySelectorAll('.result')) {
      const owner = Number(el.dataset.owner);
      const board = $('#board').getBoundingClientRect();
      const half = el.offsetHeight / 2 + 6;
      el.style.left = `${board.left + board.width / 2}px`;
      el.style.top = `${owner === GOTE ? board.top - half : board.bottom + half}px`;
    }
  }

  // ---- ボタン（両者のエリアと終局表示） ----
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled || modal) return;
    const owner = Number(btn.closest('[data-owner]').dataset.owner);
    switch (btn.dataset.act) {
      case 'undo': undo(); break;
      case 'resign':
        if (!app.game.result) {
          confirmDialog(owner, 'まいりましたか？<br><small>この対局は負けになります</small>', 'まいりました', () => {
            app.game.resign(owner);
            app.save();
          });
        }
        break;
      case 'menu': openMenu(owner); break;
      case 'again': startNewGame(app.handicapId); break;
    }
  });

  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);

  return { refresh };
}
