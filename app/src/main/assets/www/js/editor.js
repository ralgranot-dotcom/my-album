/* האלבום שלי — עורך עמודים (גרירה, שינוי גודל, סיבוב, תבניות, טקסט, מדבקות, מדיה) */
'use strict';

A.screens.editor = async function (p) {
  const al = await A.db.album(p.albumId);
  if (!al) throw new Error('האלבום לא נמצא');
  let pi = A.clamp(p.page || 0, 0, al.pages.length - 1);
  let sel = null, mode = 'move';
  const undo = [], redo = [];
  let saveT = null, renderTok = 0, dirty = false;

  const s = A.h('div.screen.editor');
  const title = A.h('h1', null, '');
  const head = A.h('header.top', null,
    A.h('button.iconbtn', { type: 'button', 'aria-label': 'חזרה', onclick: () => A.router.back() }, '→'), title,
    A.h('div.row.tight', null,
      A.h('button.iconbtn', { type: 'button', 'aria-label': 'ביטול פעולה', onclick: doUndo }, '↶'),
      A.h('button.iconbtn', { type: 'button', 'aria-label': 'שחזור פעולה', onclick: doRedo }, '↷'),
      A.h('button.iconbtn', { type: 'button', 'aria-label': 'צפייה באלבום', onclick: async () => { await flush(); A.router.go('viewer', { albumId: al.id, page: pi }); } }, '📖')));
  const wrap = A.h('div.ed-wrap');
  const canvas = A.h('canvas.ed-canvas');
  const overlay = A.h('div.ed-overlay');
  const pageBox = A.h('div.ed-page', null, canvas, overlay);
  wrap.appendChild(pageBox);
  const tools = A.h('div.ed-tools');
  const strip = A.h('div.ed-strip');
  const saved = A.h('span.saved', null, '');
  s.append(head, wrap, A.h('div.ed-status', null, A.h('span.pg-label'), saved), tools, strip);

  const page = () => al.pages[pi];
  const elById = id => page().elements.find(e => e.id === id);
  let PW = 300, PH = 300;

  function sizeCanvas() {
    const asp = A.model.aspect(al);
    const maxW = Math.min(window.innerWidth - 24, 640), maxH = Math.max(220, window.innerHeight - 330);
    PW = Math.floor(Math.min(maxW, maxH * asp)); PH = Math.floor(PW / asp);
    pageBox.style.width = PW + 'px'; pageBox.style.height = PH + 'px';
  }
  async function draw() {
    const tok = ++renderTok;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const tmp = await A.render.page(al, page(), Math.round(PW * dpr), { editing: true, size: 'disp' });
    if (tok !== renderTok) return;
    canvas.width = tmp.width; canvas.height = tmp.height;
    canvas.getContext('2d').drawImage(tmp, 0, 0);
    canvas.style.width = PW + 'px'; canvas.style.height = PH + 'px';
    drawSel();
  }
  let drawQ = false;
  function redraw() { if (drawQ) return; drawQ = true; requestAnimationFrame(() => { drawQ = false; draw(); }); }

  function snapshot() { undo.push(JSON.stringify({ pi, page: page() })); if (undo.length > 60) undo.shift(); redo.length = 0; }
  function doUndo() { if (!undo.length) return A.toast('אין פעולה לביטול'); const st = JSON.parse(undo.pop()); redo.push(JSON.stringify({ pi: st.pi, page: al.pages[st.pi] })); al.pages[st.pi] = st.page; pi = st.pi; sel = null; changed(); refreshAll(); }
  function doRedo() { if (!redo.length) return A.toast('אין פעולה לשחזור'); const st = JSON.parse(redo.pop()); undo.push(JSON.stringify({ pi: st.pi, page: al.pages[st.pi] })); al.pages[st.pi] = st.page; pi = st.pi; sel = null; changed(); refreshAll(); }
  function changed() {
    page().v = (page().v || 0) + 1;
    dirty = true; saved.textContent = 'שומר…';
    clearTimeout(saveT);
    saveT = setTimeout(flush, 700);
    redraw();
  }
  async function flush() {
    clearTimeout(saveT);
    if (!dirty) return;
    dirty = false;
    try { await A.db.saveAlbum(al); A.viewer.invalidate(); saved.textContent = '✓ נשמר אוטומטית'; updateThumb(pi); }
    catch (e) { saved.textContent = '⚠️ השמירה נכשלה'; A.alert('השמירה נכשלה', e.message); }
  }

  /* ----- שכבת בחירה ----- */
  function drawSel() {
    overlay.innerHTML = '';
    const e = sel && elById(sel);
    if (!e) { renderTools(); return; }
    const box = A.h('div.selbox' + (mode === 'crop' ? '.crop' : ''));
    box.style.left = e.x * PW + 'px'; box.style.top = e.y * PH + 'px';
    box.style.width = e.w * PW + 'px'; box.style.height = e.h * PH + 'px';
    box.style.transform = 'rotate(' + (e.rot || 0) + 'deg)';
    if (mode !== 'crop') {
      ['nw', 'ne', 'sw', 'se'].forEach(k => box.appendChild(A.h('div.hdl.' + k, { 'data-h': k })));
      box.appendChild(A.h('div.hdl.rot', { 'data-h': 'rot' }, '⟳'));
    } else box.appendChild(A.h('div.crop-tip', null, 'גררו כדי למקם · צבטו כדי להגדיל'));
    overlay.appendChild(box);
    renderTools();
  }

  function hit(px, py) {
    const els = page().elements.slice().sort((a, b) => (b.z || 0) - (a.z || 0));
    for (const e of els) {
      const cx = (e.x + e.w / 2) * PW, cy = (e.y + e.h / 2) * PH;
      const r = -(e.rot || 0) * Math.PI / 180;
      const dx = px - cx, dy = py - cy;
      const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(lx) <= e.w * PW / 2 + 6 && Math.abs(ly) <= e.h * PH / 2 + 6) return e;
    }
    return null;
  }

  /* ----- מחוות ----- */
  const pts = new Map();
  let g = null, lastTap = { t: 0, id: null };
  overlay.addEventListener('pointerdown', ev => {
    overlay.setPointerCapture(ev.pointerId);
    const r = overlay.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    pts.set(ev.pointerId, { x, y });
    const e = sel && elById(sel);
    if (pts.size === 2 && e) {
      const [a, b] = Array.from(pts.values());
      g = { kind: mode === 'crop' ? 'cropPinch' : 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), a0: Math.atan2(b.y - a.y, b.x - a.x), w: e.w, h: e.h, x: e.x, y: e.y, rot: e.rot || 0, zoom: e.zoom || 1 };
      return;
    }
    const h = ev.target.dataset && ev.target.dataset.h;
    if (h && e) { snapshot(); g = { kind: h === 'rot' ? 'rotate' : 'resize', h, x0: x, y0: y, e0: Object.assign({}, e) }; return; }
    const target = hit(x, y);
    const now = Date.now();
    if (target && lastTap.id === target.id && now - lastTap.t < 320) { lastTap = { t: 0 }; g = null; dbl(target); return; }
    lastTap = { t: now, id: target && target.id };
    if (mode === 'crop' && e && target && target.id === e.id) { snapshot(); g = { kind: 'pan', x0: x, y0: y, ox: e.ox || 0, oy: e.oy || 0 }; return; }
    if (mode === 'crop') { mode = 'move'; }
    if (target) {
      if (sel !== target.id) { sel = target.id; drawSel(); }
      snapshot(); g = { kind: 'move', x0: x, y0: y, ex: target.x, ey: target.y, moved: false };
    } else { sel = null; g = null; drawSel(); }
  });
  overlay.addEventListener('pointermove', ev => {
    if (!pts.has(ev.pointerId) || !g) return;
    const r = overlay.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    pts.set(ev.pointerId, { x, y });
    const e = sel && elById(sel);
    if (!e) return;
    if ((g.kind === 'pinch' || g.kind === 'cropPinch') && pts.size >= 2) {
      const [a, b] = Array.from(pts.values());
      const sc = Math.hypot(a.x - b.x, a.y - b.y) / (g.d0 || 1);
      if (g.kind === 'cropPinch') { e.zoom = A.clamp(g.zoom * sc, 1, 5); redraw(); return; }
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) - g.a0) * 180 / Math.PI;
      const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
      e.w = A.clamp(g.w * sc, 0.04, 1.6); e.h = A.clamp(g.h * sc, 0.04, 1.6);
      e.x = cx - e.w / 2; e.y = cy - e.h / 2;
      e.rot = snapRot(g.rot + ang);
      redraw(); return;
    }
    if (g.kind === 'move') {
      e.x = g.ex + (x - g.x0) / PW; e.y = g.ey + (y - g.y0) / PH;
      /* הצמדה למרכז ולשוליים */
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      if (Math.abs(cx - 0.5) < 0.012) e.x = 0.5 - e.w / 2;
      if (Math.abs(cy - 0.5) < 0.012) e.y = 0.5 - e.h / 2;
      g.moved = true; redraw();
    } else if (g.kind === 'pan') {
      const z = e.zoom || 1;
      e.ox = A.clamp(g.ox - (x - g.x0) / (e.w * PW) * 2 / z * 1.5, -1, 1);
      e.oy = A.clamp(g.oy - (y - g.y0) / (e.h * PH) * 2 / z * 1.5, -1, 1);
      redraw();
    } else if (g.kind === 'rotate') {
      const cx = (g.e0.x + g.e0.w / 2) * PW, cy = (g.e0.y + g.e0.h / 2) * PH;
      e.rot = snapRot(Math.atan2(y - cy, x - cx) * 180 / Math.PI + 90);
      redraw();
    } else if (g.kind === 'resize') {
      const e0 = g.e0, rad = (e0.rot || 0) * Math.PI / 180;
      const dx = x - g.x0, dy = y - g.y0;
      const lx = dx * Math.cos(-rad) - dy * Math.sin(-rad), ly = dx * Math.sin(-rad) + dy * Math.cos(-rad);
      const sx = g.h.includes('e') ? 1 : -1, sy = g.h.includes('s') ? 1 : -1;
      let nw = Math.max(0.04 * PW, e0.w * PW + sx * lx), nh = Math.max(0.04 * PH, e0.h * PH + sy * ly);
      if (e.type === 'sticker' || ev.shiftKey) { const k = Math.max(nw / (e0.w * PW), nh / (e0.h * PH)); nw = e0.w * PW * k; nh = e0.h * PH * k; }
      /* הנקודה הנגדית נשארת במקומה */
      const ax = -sx * e0.w * PW / 2, ay = -sy * e0.h * PH / 2;
      const c0x = (e0.x + e0.w / 2) * PW, c0y = (e0.y + e0.h / 2) * PH;
      const wax = c0x + ax * Math.cos(rad) - ay * Math.sin(rad), way = c0y + ax * Math.sin(rad) + ay * Math.cos(rad);
      const nax = -sx * nw / 2, nay = -sy * nh / 2;
      const ncx = wax - (nax * Math.cos(rad) - nay * Math.sin(rad)), ncy = way - (nax * Math.sin(rad) + nay * Math.cos(rad));
      e.w = nw / PW; e.h = nh / PH; e.x = (ncx - nw / 2) / PW; e.y = (ncy - nh / 2) / PH;
      redraw();
    }
  });
  const up = ev => {
    if (!pts.has(ev.pointerId)) return;
    pts.delete(ev.pointerId);
    if (!g) return;
    if (pts.size === 0) {
      if (g.kind === 'move' && !g.moved) { undo.pop(); g = null; return; }
      g = null; changed();
    }
  };
  overlay.addEventListener('pointerup', up);
  overlay.addEventListener('pointercancel', up);
  function snapRot(a) { a = ((a + 540) % 360) - 180; for (const s of [0, 90, -90, 180, -180]) if (Math.abs(a - s) < 4) return s === -180 ? 180 : s; return Math.round(a * 10) / 10; }

  async function dbl(e) {
    sel = e.id;
    if (e.type === 'photo') { if (!e.photoId) return replacePhoto(e); mode = 'crop'; drawSel(); A.toast('מצב התאמה: גררו את התמונה בתוך המסגרת'); return; }
    if (e.type === 'text') return editText(e);
    if (e.type === 'video' || e.type === 'audio') return A.viewer.playMedia(e.mediaId, e.type, e.caption);
  }

  /* ----- סרגלי כלים ----- */
  function tb(icon, label, fn, cls) { return A.h('button.tbtn' + (cls ? '.' + cls : ''), { type: 'button', onclick: fn, 'aria-label': label }, A.h('span', null, icon), A.h('small', null, label)); }
  function renderTools() {
    tools.innerHTML = '';
    const e = sel && elById(sel);
    title.textContent = al.name;
    A.$('.pg-label', s).textContent = 'עמוד ' + (pi + 1) + ' מתוך ' + al.pages.length;
    if (!e) {
      tools.append(
        tb('🖼️', 'תמונות', addPhotos), tb('🧩', 'תבנית', pickTemplate), tb('🔤', 'טקסט', addText), tb('😊', 'מדבקה', addSticker),
        tb('🌸', 'איור', addIllus), tb('🎨', 'רקע', pickBackground), tb('↔️', 'פריסה כפולה', spreadPhoto), tb('🎬', 'סרטון', addVideo),
        tb('🎙️', 'קול', addAudio), tb('🤖', 'סידור אוטומטי', autoPage), tb('📄', 'עמודים', pageMenu));
      return;
    }
    if (e.type === 'photo') tools.append(tb('🔁', 'החלפה', () => replacePhoto(e)), tb('🎯', mode === 'crop' ? 'סיום התאמה' : 'התאמה במסגרת', () => { mode = mode === 'crop' ? 'move' : 'crop'; drawSel(); }), tb('✏️', 'עריכת תמונה', () => editPhoto(e)), tb('⬭', 'צורה', () => pickShape(e)), tb('🖼️', 'מסגרת', () => pickFrame(e)), tb('💬', 'כיתוב', () => editCaption(e)));
    if (e.type === 'text') tools.append(tb('✍️', 'עריכה', () => editText(e)), tb('🎨', 'עיצוב טקסט', () => styleText(e)));
    if (e.type === 'video' || e.type === 'audio') tools.append(tb('▶️', 'הפעלה', () => A.viewer.playMedia(e.mediaId, e.type, e.caption)), tb('💬', 'כיתוב', () => editCaption(e)), e.type === 'video' ? tb('🖼️', 'מסגרת', () => pickFrame(e)) : null);
    tools.append(
      tb('⬆️', 'קדימה', () => { snapshot(); e.z = Math.max(...page().elements.map(x => x.z || 0)) + 1; changed(); }),
      tb('⬇️', 'אחורה', () => { snapshot(); e.z = Math.min(...page().elements.map(x => x.z || 0)) - 1; changed(); }),
      tb('⧉', 'שכפול', () => { snapshot(); const c = JSON.parse(JSON.stringify(e)); c.id = A.uid(); c.x += 0.04; c.y += 0.04; c.z = (e.z || 0) + 1; page().elements.push(c); sel = c.id; changed(); }),
      tb('↺', 'ישר', () => { snapshot(); e.rot = 0; changed(); }),
      tb('🗑️', 'מחיקה', () => { snapshot(); page().elements = page().elements.filter(x => x !== e); sel = null; changed(); }, 'danger'),
      tb('✓', 'סיום', () => { sel = null; mode = 'move'; drawSel(); }));
  }

  /* ----- רצועת עמודים ----- */
  function buildStrip() {
    strip.innerHTML = '';
    al.pages.forEach((pg, i) => {
      const c = A.h('button.thumb' + (i === pi ? '.on' : ''), { type: 'button', 'aria-label': 'עמוד ' + (i + 1), onclick: async () => { await flush(); pi = i; sel = null; mode = 'move'; undo.length = redo.length = 0; refreshAll(); } }, A.h('span', null, i + 1));
      c.dataset.i = i;
      strip.appendChild(c);
      updateThumb(i, c);
    });
    const cur = strip.children[pi]; if (cur) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  async function updateThumb(i, el) {
    el = el || strip.children[i];
    if (!el || !al.pages[i]) return;
    const c = await A.render.page(al, al.pages[i], 120, { size: 'thumb' });
    el.style.backgroundImage = 'url(' + c.toDataURL('image/jpeg', 0.7) + ')';
  }
  function refreshAll() { sizeCanvas(); draw(); buildStrip(); }

  /* ----- פעולות ----- */
  async function addPhotos() {
    const ids = await A.pickPhotos({ multi: true, title: 'הוספת תמונות לעמוד' });
    if (!ids.length) return;
    snapshot();
    const empties = page().elements.filter(e => e.type === 'photo' && !e.photoId);
    const rest = ids.slice();
    empties.forEach(e => { if (rest.length) e.photoId = rest.shift(); });
    if (rest.length && !page().elements.length) {
      const photos = await Promise.all(rest.map(i => A.db.photo(i)));
      const left = A.render.applyTemplate(page(), A.render.autoTemplate(photos.slice(0, 9)), rest);
      if (left.length) A.toast('נוספו 9 לעמוד; לשאר השתמשו ב"הוספה לאלבום" מהספרייה');
    } else rest.forEach((id, k) => page().elements.push({ id: A.uid(), type: 'photo', photoId: id, x: 0.2 + k * 0.04, y: 0.2 + k * 0.04, w: 0.5, h: 0.4, rot: 0, shape: 'rect', frame: 'white', zoom: 1, ox: 0, oy: 0, z: page().elements.length + 1 }));
    if (!al.coverPhotoId) al.coverPhotoId = ids[0];
    changed();
  }
  async function replacePhoto(e) { const ids = await A.pickPhotos({ title: 'בחירת תמונה' }); if (!ids.length) return; snapshot(); e.photoId = ids[0]; e.zoom = 1; e.ox = e.oy = 0; changed(); }
  async function editPhoto(e) { if (!e.photoId) return replacePhoto(e); await flush(); A.router.go('photoEdit', { photoId: e.photoId }); }
  function pickTemplate() {
    const grid = A.h('div.tpl-grid');
    let close;
    A.render.TEMPLATES.forEach(t => {
      const c = A.canvas(120, 120 / A.model.aspect(al)), gg = c.getContext('2d');
      gg.fillStyle = t.bg || '#fff'; gg.fillRect(0, 0, c.width, c.height);
      t.slots.forEach(sl => { gg.save(); gg.translate((sl[0] + sl[2] / 2) * c.width, (sl[1] + sl[3] / 2) * c.height); gg.rotate((sl[4] || 0) * Math.PI / 180); gg.translate(-sl[2] * c.width / 2, -sl[3] * c.height / 2); gg.fillStyle = '#b9c3cf'; A.render.shapePath(gg, sl[5] || 'rect', sl[2] * c.width, sl[3] * c.height); gg.fill(); gg.restore(); });
      (t.texts || []).forEach(tx => { gg.fillStyle = '#e0a458'; gg.fillRect(tx[0] * c.width + 6, (tx[1] + tx[3] / 2) * c.height - 2, tx[2] * c.width - 12, 4); });
      grid.appendChild(A.h('button.tpl', { type: 'button', onclick: async () => { close(); if (t.spread) return spreadPhoto(); snapshot(); A.render.applyTemplate(page(), t); sel = null; changed(); } }, c, A.h('small', null, t.name)));
    });
    A.modal('בחירת תבנית (' + A.render.TEMPLATES.length + ')', grid, [{ label: 'סגירה', value: null }], { wide: true, onOpen: (cc, cl) => { close = cl; } });
  }
  async function addText() {
    const t = await A.prompt('הוספת טקסט', 'הטקסט', '');
    if (!t) return;
    snapshot();
    const e = { id: A.uid(), type: 'text', text: t, x: 0.1, y: 0.42, w: 0.8, h: 0.16, size: 0.06, font: 'serif', color: A.model.paperColor(al) === '#1b1b1b' ? '#f3efe6' : '#333', align: 'center', rot: 0, z: 100 };
    page().elements.push(e); sel = e.id; changed();
  }
  async function editText(e) {
    const ta = A.h('textarea.inp', { rows: 4 }); ta.value = e.text || '';
    const v = await A.modal('עריכת טקסט', ta, [{ label: 'ביטול', value: null }, { label: 'אישור', value: () => ta.value, cls: 'primary' }], { onOpen: () => setTimeout(() => ta.focus(), 80) });
    if (v == null) return;
    snapshot(); e.text = v; changed();
  }
  async function styleText(e) {
    const body = A.h('div.form');
    const sel2 = (label, opts, val, fn) => A.h('label.field', null, A.h('span', null, label), A.h('select.inp', { onchange: ev => { fn(ev.target.value); changed(); } }, opts.map(([v, l]) => A.h('option', { value: v, selected: String(v) === String(val) }, l))));
    snapshot();
    body.append(
      sel2('גופן', Object.entries(A.render.FONTS).map(([k, v]) => [k, v[0]]), e.font, v => { e.font = v; }),
      A.h('label.field', null, A.h('span', null, 'גודל'), A.h('input', { type: 'range', min: 0.02, max: 0.16, step: 0.002, value: e.size, oninput: ev => { e.size = +ev.target.value; changed(); } })),
      A.h('label.field', null, A.h('span', null, 'צבע'), A.h('input', { type: 'color', value: e.color || '#333333', oninput: ev => { e.color = ev.target.value; changed(); } })),
      sel2('יישור', [['right', 'ימין'], ['center', 'מרכז'], ['left', 'שמאל']], e.align, v => { e.align = v; }),
      A.h('label.switch-row', null, A.h('span', null, 'מודגש'), A.h('input', { type: 'checkbox', checked: !!e.bold, onchange: ev => { e.bold = ev.target.checked; changed(); } })),
      A.h('label.switch-row', null, A.h('span', null, 'צל'), A.h('input', { type: 'checkbox', checked: !!e.shadow, onchange: ev => { e.shadow = ev.target.checked; changed(); } })),
      A.h('label.switch-row', null, A.h('span', null, 'רקע לבן מאחורי הטקסט'), A.h('input', { type: 'checkbox', checked: !!e.bg, onchange: ev => { e.bg = ev.target.checked ? 'rgba(255,255,255,0.85)' : null; changed(); } })));
    await A.modal('עיצוב טקסט', body, [{ label: 'סיום', value: true, cls: 'primary' }]);
  }
  function addSticker() {
    const grid = A.h('div.emoji-grid'); let close;
    A.render.STICKERS.forEach(em => grid.appendChild(A.h('button.emoji', { type: 'button', onclick: () => { close(); snapshot(); const e = { id: A.uid(), type: 'sticker', emoji: em, x: 0.4, y: 0.4, w: 0.16, h: 0.16 * A.model.aspect(al), rot: 0, z: 200 }; page().elements.push(e); sel = e.id; changed(); } }, em)));
    A.modal('מדבקות', grid, [{ label: 'סגירה', value: null }], { onOpen: (c, cl) => { close = cl; } });
  }
  function addIllus() {
    const grid = A.h('div.emoji-grid'); let close;
    Object.entries(A.render.ILLUS).forEach(([k, v]) => grid.appendChild(A.h('button.emoji.illus', { type: 'button', title: v[0], onclick: () => { close(); snapshot(); const e = { id: A.uid(), type: 'sticker', illus: k, x: 0.38, y: 0.38, w: 0.24, h: 0.24 * A.model.aspect(al), rot: 0, z: 200 }; page().elements.push(e); sel = e.id; changed(); } }, A.h('img', { src: A.render.illusUrl(k), alt: v[0] }))));
    A.modal('איורים', grid, [{ label: 'סגירה', value: null }], { onOpen: (c, cl) => { close = cl; } });
  }
  async function pickShape(e) {
    const r = await chooseFrom('צורת התמונה', A.render.SHAPES, e.shape);
    if (r) { snapshot(); e.shape = r; changed(); }
  }
  async function pickFrame(e) {
    const r = await chooseFrom('מסגרת', A.render.FRAMES, e.frame);
    if (r) { snapshot(); e.frame = r; changed(); }
  }
  async function editCaption(e) {
    const t = await A.prompt('כיתוב', e.type === 'photo' ? 'כיתוב (מופיע במסגרת פולארויד ובהגדלה)' : 'כיתוב', e.caption || '');
    if (t == null) return;
    snapshot(); e.caption = t;
    if (e.type === 'photo' && e.photoId) { const ph = await A.db.photo(e.photoId); if (ph && !ph.caption) { ph.caption = t; await A.db.savePhoto(ph); } }
    changed();
  }
  function chooseFrom(title, map, cur) {
    return new Promise(res => {
      const box = A.h('div.list'); let close;
      Object.entries(map).forEach(([k, l]) => box.appendChild(A.h('button.list-item' + (k === cur ? '.on' : ''), { type: 'button', onclick: () => { close(); res(k); } }, l)));
      A.modal(title, box, [{ label: 'ביטול', value: null }], { onOpen: (c, cl) => { close = cl; } }).then(() => res(null));
    });
  }
  async function pickBackground() {
    const pg = page();
    const body = A.h('div.form');
    let close;
    const cols = ['#fbfaf7', '#f4ecd8', '#eadcb8', '#c8a97e', '#1b1b1b', '#f2f6fb', '#fbeff2', '#eef6ee', '#2f4a32', '#1f3a5f', '#6b2d2d', '#ffffff'];
    body.append(
      A.h('div.swatches', null, cols.map(c => A.h('button.sw', { type: 'button', style: { background: c }, 'aria-label': c, onclick: () => { snapshot(); pg.bg = c; changed(); } })),
        A.h('label.sw.custom', null, '🎨', A.h('input', { type: 'color', oninput: ev => { pg.bg = ev.target.value; changed(); } }))),
      A.h('button.btn', { type: 'button', onclick: () => { snapshot(); pg.bg = null; changed(); } }, '📜 נייר האלבום המקורי'),
      A.h('button.btn', { type: 'button', onclick: async () => { const ids = await A.pickPhotos({ title: 'תמונת רקע לעמוד' }); if (!ids.length) return; snapshot(); pg.bgPhotoId = ids[0]; pg.bgOpacity = 0.35; changed(); } }, '🌄 תמונה כרקע לעמוד'),
      pg.bgPhotoId ? A.h('label.field', null, A.h('span', null, 'שקיפות תמונת הרקע'), A.h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: pg.bgOpacity || 0.35, oninput: ev => { pg.bgOpacity = +ev.target.value; changed(); } })) : null,
      pg.bgPhotoId ? A.h('button.btn', { type: 'button', onclick: () => { snapshot(); pg.bgPhotoId = null; changed(); close(); } }, 'הסרת תמונת רקע') : null);
    A.modal('רקע העמוד', body, [{ label: 'סיום', value: null, cls: 'primary' }], { onOpen: (c, cl) => { close = cl; } });
  }
  /* תמונה אחת על פני שני עמודים */
  async function spreadPhoto() {
    if (pi === 0) return A.alert('פריסה כפולה', 'העמוד הראשון מופיע מול הכריכה הפנימית. בחרו עמוד 2 ואילך.');
    const partner = pi % 2 === 1 ? pi + 1 : pi - 1;
    if (partner >= al.pages.length) return A.alert('פריסה כפולה', 'לעמוד הזה אין עמוד צמוד בפריסה. הוסיפו עמוד.');
    const ids = await A.pickPhotos({ title: 'תמונה לפריסה כפולה' });
    if (!ids.length) return;
    snapshot();
    const right = pi % 2 === 1 ? pi : partner, left = right + 1;
    [[right, 'R'], [left, 'L']].forEach(([i, half]) => {
      const pg = al.pages[i];
      pg.elements = pg.elements.filter(e => !e.half);
      pg.elements.push({ id: A.uid(), type: 'photo', photoId: ids[0], half, x: 0, y: 0, w: 1, h: 1, rot: 0, shape: 'rect', frame: 'none', zoom: 1, ox: 0, oy: 0, z: -10 });
      pg.v = (pg.v || 0) + 1;
    });
    A.toast('התמונה נפרסה על עמודים ' + (right + 1) + '–' + (left + 1));
    changed(); buildStrip();
  }
  async function addVideo() {
    const files = await A.pickFiles('video/*', false);
    if (!files.length) return;
    const pr = A.progress('מוסיף סרטון…'); pr.set(0.3);
    try {
      const m = await A.media.add(files[0], 'video', files[0].name);
      snapshot();
      const asp = m.w && m.h ? m.w / m.h : 16 / 9;
      const w = 0.6, h = w / asp * A.model.aspect(al);
      const e = { id: A.uid(), type: 'video', mediaId: m.id, x: 0.2, y: 0.5 - h / 2, w, h, rot: 0, shape: 'rect', frame: 'white', z: 150 };
      page().elements.push(e); sel = e.id; changed();
    } catch (err) { A.alert('הוספת הסרטון נכשלה', err.message); }
    finally { pr.done(); }
  }
  async function addAudio() {
    const how = await A.modal('הוספת קול', A.h('p', null, 'הקליטו ברכה או סיפור, או בחרו קובץ שמע מהמכשיר.'), [{ label: 'ביטול', value: null }, { label: '📁 קובץ', value: 'file' }, { label: '🎙️ הקלטה', value: 'rec', cls: 'primary' }]);
    if (!how) return;
    let blob = null, name = 'הקלטה';
    if (how === 'rec') blob = await A.media.record();
    else { const f = await A.pickFiles('audio/*', false); if (f.length) { blob = f[0]; name = f[0].name; } }
    if (!blob) return;
    const m = await A.media.add(blob, 'audio', name);
    const cap = await A.prompt('כיתוב להקלטה', 'מה שומעים?', how === 'rec' ? 'ברכה אישית' : name);
    snapshot();
    const e = { id: A.uid(), type: 'audio', mediaId: m.id, caption: cap || 'הקשיבו', x: 0.2, y: 0.82, w: 0.6, h: 0.1 * A.model.aspect(al), rot: 0, z: 160 };
    page().elements.push(e); sel = e.id; changed();
  }
  async function autoPage() {
    const ids = page().elements.filter(e => e.type === 'photo' && e.photoId).map(e => e.photoId);
    if (!ids.length) return A.alert('סידור אוטומטי', 'הוסיפו קודם תמונות לעמוד, והעוזר יציע סידור.');
    const photos = await Promise.all(ids.map(i => A.db.photo(i)));
    const tpl = A.render.autoTemplate(photos);
    const before = JSON.stringify(page());
    snapshot();
    A.render.applyTemplate(page(), tpl, ids);
    changed();
    const ok = await A.confirm('🤖 הצעת סידור', 'העוזר סידר את העמוד בתבנית "' + tpl.name + '". לשמור את הסידור?', 'שמירה');
    if (!ok) { al.pages[pi] = JSON.parse(before); undo.pop(); changed(); }
  }
  function pageMenu() {
    const box = A.h('div.list'); let close;
    const items = [
      ['➕', 'הוספת עמוד אחרי הנוכחי', () => { snapshot(); al.pages.splice(pi + 1, 0, A.model.newPage(al)); pi++; }],
      ['⧉', 'שכפול העמוד', () => { snapshot(); const c = JSON.parse(JSON.stringify(page())); c.id = A.uid(); c.elements.forEach(e => { e.id = A.uid(); }); al.pages.splice(pi + 1, 0, c); pi++; }],
      ['◀', 'הזזת העמוד קדימה', () => { if (pi < al.pages.length - 1) { const t = al.pages[pi]; al.pages[pi] = al.pages[pi + 1]; al.pages[pi + 1] = t; pi++; } }],
      ['▶', 'הזזת העמוד אחורה', () => { if (pi > 0) { const t = al.pages[pi]; al.pages[pi] = al.pages[pi - 1]; al.pages[pi - 1] = t; pi--; } }],
      ['🧹', 'ניקוי העמוד', () => { snapshot(); page().elements = []; page().bg = null; page().bgPhotoId = null; }],
      ['🗑️', 'מחיקת העמוד', async () => {
        if (al.pages.length <= 2) return A.alert('לא ניתן', 'באלבום חייבים להיות לפחות 2 עמודים.');
        if (!(await A.confirm('מחיקת עמוד', 'למחוק את עמוד ' + (pi + 1) + '? (התמונות נשארות בספרייה)', 'מחיקה', true))) return;
        al.pages.splice(pi, 1); pi = Math.min(pi, al.pages.length - 1);
      }]
    ];
    items.forEach(([i, l, f]) => box.appendChild(A.h('button.list-item', { type: 'button', onclick: async () => {
      close(); await f();
      if (al.pages.length % 2) al.pages.push(A.model.newPage(al));
      sel = null; page().v = (page().v || 0) + 1; dirty = true; await flush(); refreshAll();
    } }, i + ' ' + l)));
    A.modal('ניהול עמודים', box, [{ label: 'סגירה', value: null }], { onOpen: (c, cl) => { close = cl; } });
  }

  window.addEventListener('resize', refreshAll);
  refreshAll();
  return { el: s, leave: () => { window.removeEventListener('resize', refreshAll); flush(); } };
};
