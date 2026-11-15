/* האלבום שלי — מנוע תצוגה ודפדוף תלת־ממדי (ספר עברי: נפתח מימין לשמאל) */
'use strict';
A.viewer = {};

(function () {
  const V = A.viewer;
  let al, root, stage, book, halfR, halfL, leafHost, hot, shadowEl, info, state;

  /* מבנה: state.pos = 0 סגור (כריכה קדמית), 1..S פריסות פתוחות, S+1 סגור מאחור */
  function spreadCount() { return al.pages.length / 2 + 1; }
  /* מחזיר תוכן הפריסה: {R, L} — כל צד הוא {kind:'page',i} | {kind:'end'} */
  function spread(s) {
    const n = al.pages.length;
    if (s === 1) return { R: { kind: 'end' }, L: { kind: 'page', i: 0 } };
    if (s === spreadCount()) return { R: { kind: 'page', i: n - 1 }, L: { kind: 'end' } };
    return { R: { kind: 'page', i: 2 * s - 3 }, L: { kind: 'page', i: 2 * s - 2 } };
  }
  V.spreadOfPage = i => i === 0 ? 1 : Math.floor((i + 1) / 2) + 1;

  /* ----- מטמון תמונות עמודים ----- */
  const imgCache = new Map();
  function sideKey(side) {
    if (side.kind === 'end') return 'end';
    if (side.kind === 'cover') return 'cover';
    if (side.kind === 'back') return 'back';
    const p = al.pages[side.i];
    return 'p' + p.id + ':' + (p.v || 0);
  }
  async function sideUrl(side) {
    const key = al.id + '|' + sideKey(side) + '|' + state.pw;
    if (imgCache.has(key)) return imgCache.get(key);
    const pr = (async () => {
      const W = Math.round(state.pw * Math.min(2, window.devicePixelRatio || 1));
      let c;
      if (side.kind === 'end') c = A.render.endpaper(al, W);
      else if (side.kind === 'cover') c = await A.render.cover(al, W, false);
      else if (side.kind === 'back') c = await A.render.cover(al, W, true);
      else c = await A.render.page(al, al.pages[side.i], W);
      const b = await A.canvasToBlob(c, 'image/jpeg', 0.9);
      return URL.createObjectURL(b);
    })();
    imgCache.set(key, pr);
    if (imgCache.size > 16) { const k = imgCache.keys().next().value; const old = imgCache.get(k); imgCache.delete(k); old.then(u => setTimeout(() => URL.revokeObjectURL(u), 4000)); }
    return pr;
  }
  V.invalidate = () => { imgCache.forEach(p => p.then(u => setTimeout(() => URL.revokeObjectURL(u), 4000))); imgCache.clear(); };

  function sidesAt(pos) {
    if (pos <= 0) return { R: null, L: { kind: 'cover' } };
    if (pos > spreadCount()) return { R: { kind: 'back' }, L: null };
    return spread(pos);
  }

  /* ----- בניית המסך ----- */
  V.open = async function (album, startPage) {
    al = album;
    state = { pos: 0, anim: false, rotate: false, yaw: 0, pitch: 18, zoom: 1, panX: 0, panY: 0, auto: null };
    root = A.h('div.viewer');
    const table = A.h('div.table');
    stage = A.h('div.stage');
    book = A.h('div.book');
    shadowEl = A.h('div.book-shadow');
    halfR = A.h('div.half.right', null, A.h('div.pg'), A.h('div.shade'));
    halfL = A.h('div.half.left', null, A.h('div.pg'), A.h('div.shade'));
    const blockR = A.h('div.block.right'), blockL = A.h('div.block.left');
    const boardR = A.h('div.board.right'), boardL = A.h('div.board.left');
    const spineEl = A.h('div.spine3d');
    leafHost = A.h('div.leafhost');
    hot = A.h('div.hot');
    book.append(shadowEl, boardR, boardL, spineEl, blockR, blockL, halfR, halfL, leafHost, hot);
    stage.append(book);
    table.appendChild(stage);
    info = A.h('div.v-info');
    const bar = A.h('div.v-bar', null,
      btn('↩️', 'חזרה', () => A.router.back()),
      btn('🔖', 'סימנייה', toggleBookmark, 'bm'),
      btn('📑', 'סימניות', showBookmarks),
      btn('▶️', 'תצוגה אוטומטית', toggleAuto, 'auto'),
      al.musicId ? btn('🎵', 'מוזיקה', toggleMusic, 'music') : null,
      btn('🔄', 'סיבוב האלבום', toggleRotate, 'rot'),
      btn('✏️', 'עריכת עמוד', editCurrent),
      btn('📤', 'יצוא ושיתוף', () => A.exporter.menu(al))
    );
    const nav = A.h('div.v-nav', null,
      A.h('button.navbtn', { type: 'button', 'aria-label': 'העמוד הבא', onclick: () => flipTo(state.pos + 1) }, '‹'),
      info,
      A.h('button.navbtn', { type: 'button', 'aria-label': 'העמוד הקודם', onclick: () => flipTo(state.pos - 1) }, '›'));
    root.append(table, bar, nav);
    if (A.settings.get('flipHint')) {
      const hint = A.h('div.v-hint', null, '👉 החליקו את הדף ימינה כדי לדפדף קדימה (כמו בספר עברי)');
      root.appendChild(hint);
      setTimeout(() => hint.classList.add('gone'), 4500);
      A.settings.set('flipHint', false);
    }
    state.blocks = { blockR, blockL, boardR, boardL, spineEl };
    bindGestures(table);
    window.addEventListener('resize', layout);
    V._cleanup = () => { window.removeEventListener('resize', layout); stopAuto(); stopMusic(); };
    layout();
    if (startPage != null) state.pos = V.spreadOfPage(startPage);
    await showPos(state.pos);
    preload();
    return root;
  };
  V.close = () => { if (V._cleanup) V._cleanup(); V._cleanup = null; };

  function btn(icon, label, fn, cls) { return A.h('button.vbtn' + (cls ? '.' + cls : ''), { type: 'button', title: label, 'aria-label': label, onclick: fn }, A.h('span', null, icon), A.h('small', null, label)); }

  function layout() {
    const aw = window.innerWidth, ah = window.innerHeight - 150;
    const asp = A.model.aspect(al);
    let pw = Math.min(aw * 0.47, (ah * 0.86) * asp);
    pw = Math.max(120, Math.floor(pw));
    const ph = Math.floor(pw / asp);
    const changed = state.pw && Math.abs(state.pw - pw) > 40;
    state.pw = pw; state.ph = ph;
    book.style.width = pw * 2 + 'px'; book.style.height = ph + 'px';
    root.style.setProperty('--pw', pw + 'px'); root.style.setProperty('--ph', ph + 'px');
    applyTransform();
    if (changed) { V.invalidate(); showPos(state.pos); }
  }

  /* עובי הספר: מספר הדפים בכל צד */
  function updateThickness() {
    const n = al.pages.length / 2 + 1;
    const total = Math.min(26, 6 + al.pages.length * 0.25);
    const fracR = state.pos <= 0 ? 0 : state.pos > spreadCount() ? 1 : (state.pos - 1) / n;
    const tR = Math.max(2, total * fracR), tL = Math.max(2, total * (1 - fracR));
    const { blockR, blockL, boardR, boardL, spineEl } = state.blocks;
    blockR.style.setProperty('--t', tR + 'px'); blockL.style.setProperty('--t', tL + 'px');
    const open = state.pos > 0 && state.pos <= spreadCount();
    blockR.style.display = state.pos <= 0 ? 'none' : ''; blockL.style.display = state.pos > spreadCount() ? 'none' : '';
    boardR.style.display = state.pos <= 0 ? 'none' : ''; boardL.style.display = state.pos > spreadCount() ? 'none' : '';
    root.style.setProperty('--tR', tR + 'px'); root.style.setProperty('--tL', tL + 'px'); root.style.setProperty('--cov', al.coverColor);
    spineEl.style.display = open ? 'none' : '';
    spineEl.style.setProperty('--t', total + 'px');
    spineEl.classList.toggle('atright', state.pos <= 0);
    book.classList.toggle('glossy', al.finish === 'glossy');
  }

  /* כשהספר סגור — מזיזים אותו כך שהכריכה תהיה במרכז */
  function shiftFor(p) { return p <= 0 ? state.pw / 2 : p > spreadCount() ? -state.pw / 2 : 0; }
  function applyTransform() {
    let shift = shiftFor(state.pos);
    if (state.shiftOverride != null) shift = state.shiftOverride;
    const t = 'translate(' + state.panX + 'px,' + state.panY + 'px) scale(' + state.zoom + ') rotateX(' + state.pitch + 'deg) rotateY(' + state.yaw + 'deg) translateX(' + shift + 'px)';
    book.style.transform = t;
    const closedF = state.pos <= 0, closedB = state.pos > spreadCount();
    shadowEl.style.left = closedF ? '0' : closedB ? '50%' : '0';
    shadowEl.style.width = closedF || closedB ? '50%' : '100%';
  }

  async function setHalf(el, side) {
    const pg = el.querySelector('.pg');
    el.style.visibility = side ? 'visible' : 'hidden';
    el.classList.toggle('iscover', !!side && (side.kind === 'cover' || side.kind === 'back'));
    if (!side) { pg.style.backgroundImage = ''; return; }
    const u = await sideUrl(side);
    pg.style.backgroundImage = 'url("' + u + '")';
  }

  async function showPos(pos) {
    state.pos = pos;
    const s = sidesAt(pos);
    await Promise.all([setHalf(halfR, s.R), setHalf(halfL, s.L)]);
    updateThickness(); applyTransform(); buildHotspots(); updateInfo();
  }

  function updateInfo() {
    const S = spreadCount();
    let t;
    if (state.pos <= 0) t = 'כריכה קדמית';
    else if (state.pos > S) t = 'כריכה אחורית';
    else { const sp = spread(state.pos); const a = sp.R.kind === 'page' ? sp.R.i + 1 : null, b = sp.L.kind === 'page' ? sp.L.i + 1 : null; t = 'עמודים ' + [a, b].filter(Boolean).join('–') + ' מתוך ' + al.pages.length; }
    info.textContent = t;
    const bm = A.$('.vbtn.bm', root);
    if (bm) bm.classList.toggle('on', currentPages().some(i => (al.bookmarks || []).includes(i)));
  }
  function currentPages() {
    if (state.pos <= 0 || state.pos > spreadCount()) return [];
    const sp = spread(state.pos);
    return [sp.R, sp.L].filter(x => x.kind === 'page').map(x => x.i);
  }

  function preload() {
    [state.pos + 1, state.pos + 2, state.pos - 1].forEach(p => {
      const s = sidesAt(p);
      if (p >= 0 && p <= spreadCount() + 1) { if (s.R) sideUrl(s.R); if (s.L) sideUrl(s.L); }
    });
  }

  /* ----- עלה מתהפך עם קיפול (רצועות) ----- */
  function buildLeaf(dir, frontUrl, backUrl, rigid) {
    leafHost.innerHTML = '';
    const pw = state.pw;
    const N = rigid ? 1 : (A.settings.get('quality') === 'low' ? 5 : 10);
    const w = pw / N;
    const strips = [];
    const wrap = A.h('div.leaf' + (dir > 0 ? '.fwd' : '.bwd') + (rigid ? '.rigid' : ''));
    let parent = wrap;
    for (let i = 0; i < N; i++) {
      const st = A.h('div.strip');
      st.style.width = (w + (i < N - 1 ? 0.6 : 0)) + 'px';
      const fx = dir > 0 ? -(pw - (i + 1) * w) : -(i * w);
      const bx = dir > 0 ? -(i * w) : -(pw - (i + 1) * w);
      const front = A.h('div.face.front'), back = A.h('div.face.back');
      front.style.backgroundImage = 'url("' + frontUrl + '")'; front.style.backgroundPosition = fx + 'px 0';
      back.style.backgroundImage = 'url("' + backUrl + '")'; back.style.backgroundPosition = bx + 'px 0';
      front.style.backgroundSize = back.style.backgroundSize = pw + 'px ' + state.ph + 'px';
      const sf = A.h('div.sh'), sb = A.h('div.sh');
      front.appendChild(sf); back.appendChild(sb);
      st.append(front, back);
      if (i === 0) { st.style[dir > 0 ? 'right' : 'left'] = '0px'; }
      else { st.style[dir > 0 ? 'right' : 'left'] = (w - 0.3) + 'px'; }
      parent.appendChild(st);
      strips.push({ st, sf, sb });
      parent = st;
    }
    leafHost.appendChild(wrap);
    return { wrap, strips, N, dir };
  }

  function setLeafProgress(leaf, t, dragging) {
    const sign = leaf.dir > 0 ? 1 : -1;
    const θ = 180 * t;
    const bendTot = leaf.N > 1 ? (dragging ? 42 : 26) * Math.sin(Math.PI * t) : 0;
    const θ0 = Math.max(0.3, θ - bendTot * 0.55);
    const δ = leaf.N > 1 ? bendTot / (leaf.N - 1) : 0;
    let acc = 0;
    leaf.strips.forEach((s, i) => {
      const a = i === 0 ? θ0 : δ;
      acc += a;
      s.st.style.transform = 'rotateY(' + (sign * a) + 'deg)';
      const eff = acc;
      const light = Math.cos(eff * Math.PI / 180);
      s.sf.style.opacity = A.clamp((1 - light) * 0.45 + (i / leaf.N) * 0.05 * Math.sin(Math.PI * t), 0, 0.6);
      s.sb.style.opacity = A.clamp((1 + light) * 0.35, 0, 0.6);
    });
    const shR = halfR.querySelector('.shade'), shL = halfL.querySelector('.shade');
    const under = Math.sin(Math.PI * t) * 0.5;
    if (leaf.dir > 0) { shL.style.opacity = (1 - t) * 0.55 * (t > 0.02 ? 1 : 0); shR.style.opacity = under * (t > 0.5 ? 1 : 0.4); }
    else { shR.style.opacity = (1 - t) * 0.55 * (t > 0.02 ? 1 : 0); shL.style.opacity = under * (t > 0.5 ? 1 : 0.4); }
  }
  function clearShades() { halfR.querySelector('.shade').style.opacity = 0; halfL.querySelector('.shade').style.opacity = 0; }

  /* התחלת דפדוף: מחזיר אובייקט שליטה */
  async function beginFlip(dir) {
    const S = spreadCount();
    const target = state.pos + dir;
    if (target < 0 || target > S + 1) return null;
    const cur = sidesAt(state.pos), nxt = sidesAt(target);
    const frontSide = dir > 0 ? cur.L : cur.R;
    const backSide = dir > 0 ? nxt.R : nxt.L;
    if (!frontSide || !backSide) return null;
    const [fu, bu] = await Promise.all([sideUrl(frontSide), sideUrl(backSide)]);
    const underSide = dir > 0 ? nxt.L : nxt.R;
    const rigid = frontSide.kind === 'cover' || frontSide.kind === 'back' || backSide.kind === 'cover' || backSide.kind === 'back';
    const leaf = buildLeaf(dir, fu, bu, rigid);
    leaf.target = target;
    leaf.wrap.classList.toggle('coverleaf', rigid);
    /* מתחת לעלה: חושפים את העמוד הבא */
    await setHalf(dir > 0 ? halfL : halfR, underSide);
    hot.innerHTML = '';
    setLeafProgress(leaf, 0, true);
    return leaf;
  }

  function animateLeaf(leaf, from, to, ms) {
    return new Promise(res => {
      const t0 = performance.now();
      const step = now => {
        const k = A.clamp((now - t0) / ms, 0, 1);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const t = from + (to - from) * e;
        setLeafProgress(leaf, t, false);
        if (leaf.shiftFrom != null) { state.shiftOverride = leaf.shiftFrom + (leaf.shiftTo - leaf.shiftFrom) * t; applyTransform(); }
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  function prepShift(leaf) {
    const a = shiftFor(state.pos), b = shiftFor(leaf.target);
    if (a !== b) { leaf.shiftFrom = a; leaf.shiftTo = b; }
  }

  async function finishFlip(leaf, commit, fromT) {
    state.anim = true;
    prepShift(leaf);
    await animateLeaf(leaf, fromT, commit ? 1 : 0, (commit ? 1 - fromT : fromT) * 650 + 120);
    state.shiftOverride = null;
    if (commit) {
      A.sound.flip();
      /* הצד שאליו נחת העלה מקבל את התוכן החדש */
      await showPos(leaf.target);
    } else {
      await showPos(state.pos);
    }
    leafHost.innerHTML = '';
    clearShades();
    state.anim = false;
    preload();
  }

  async function flipTo(target) {
    if (state.anim) return false;
    const dir = target > state.pos ? 1 : -1;
    if (target === state.pos) return false;
    state.anim = true;
    const leaf = await beginFlip(dir);
    if (!leaf) { state.anim = false; return false; }
    await finishFlip(leaf, true, 0);
    return true;
  }
  V.flipTo = p => flipTo(p);
  V.next = () => flipTo(state.pos + 1);
  V.prev = () => flipTo(state.pos - 1);
  V.state = () => state;
  V.album = () => al;
  V.goPage = async i => { await showPos(V.spreadOfPage(i)); preload(); };

  /* ----- מחוות ----- */
  function bindGestures(el) {
    const pts = new Map();
    let drag = null, pinch = null, lastTap = 0;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.v-bar,.v-nav')) return;
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = Array.from(pts.values());
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, px: state.panX, py: state.panY };
        if (drag && drag.leaf) { finishFlip(drag.leaf, false, drag.t); }
        drag = null;
        return;
      }
      drag = { x0: e.clientX, y0: e.clientY, t0: performance.now(), leaf: null, dir: 0, t: 0, starting: false, mode: state.rotate ? 'rot' : state.zoom > 1.05 ? 'pan' : 'flip', yaw0: state.yaw, pitch0: state.pitch, px: state.panX, py: state.panY, target: e.target };
    });
    el.addEventListener('pointermove', async e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        const [a, b] = Array.from(pts.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        state.zoom = A.clamp(pinch.zoom * d / pinch.d, 1, 4);
        state.panX = pinch.px + ((a.x + b.x) / 2 - pinch.cx); state.panY = pinch.py + ((a.y + b.y) / 2 - pinch.cy);
        if (state.zoom <= 1.02) { state.panX = 0; state.panY = 0; }
        applyTransform();
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (drag.mode === 'rot') {
        state.yaw = A.clamp(drag.yaw0 + dx * 0.4, -75, 75); state.pitch = A.clamp(drag.pitch0 - dy * 0.3, 0, 70); applyTransform(); return;
      }
      if (drag.mode === 'pan') { state.panX = drag.px + dx; state.panY = drag.py + dy; applyTransform(); return; }
      if (state.anim && !drag.leaf) return;
      if (!drag.leaf && !drag.starting && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        drag.starting = true;
        drag.dir = dx > 0 ? 1 : -1; /* גרירה ימינה = קדימה (ספר עברי) */
        state.anim = true;
        const leaf = await beginFlip(drag.dir);
        if (!leaf || !drag) { state.anim = false; if (drag) drag.starting = false; return; }
        drag.leaf = leaf;
        prepShift(leaf);
      }
      if (drag.leaf) {
        const span = state.pw * 1.6 * state.zoom;
        drag.t = A.clamp((dx * drag.dir) / span, 0, 0.98);
        setLeafProgress(drag.leaf, drag.t, true);
        if (drag.leaf.shiftFrom != null) { state.shiftOverride = drag.leaf.shiftFrom + (drag.leaf.shiftTo - drag.leaf.shiftFrom) * drag.t; applyTransform(); }
        drag.lastX = e.clientX; drag.lastT = performance.now();
      }
    });
    const end = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pinch) { if (pts.size < 2) pinch = null; return; }
      if (!drag) return;
      const d = drag; drag = null;
      const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
      if (d.leaf) {
        const dt = performance.now() - d.t0;
        const fast = dt < 300 && Math.abs(dx) > 40;
        finishFlip(d.leaf, d.t > 0.33 || fast, d.t);
        return;
      }
      if (d.starting) { /* הדפדוף עדיין נטען */ const wait = setInterval(() => { if (!state.anim) clearInterval(wait); }, 50); return; }
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && d.mode !== 'rot') {
        const now = Date.now();
        if (now - lastTap < 300) { lastTap = 0; state.zoom = state.zoom > 1.05 ? 1 : 2; state.panX = state.panY = 0; applyTransform(); return; }
        lastTap = now;
        const hs = d.target.closest && d.target.closest('.hs');
        if (hs) { setTimeout(() => { if (lastTap === now) hotAction(hs); }, 280); return; }
        const r = book.getBoundingClientRect();
        const rel = (e.clientX - r.left) / r.width;
        setTimeout(() => { if (lastTap !== now) return; if (rel < 0.22) flipTo(state.pos + 1); else if (rel > 0.78) flipTo(state.pos - 1); }, 280);
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /* ----- אזורים אינטראקטיביים (וידאו, שמע, הגדלת תמונה) ----- */
  function buildHotspots() {
    hot.innerHTML = '';
    if (state.pos <= 0 || state.pos > spreadCount()) return;
    const sp = spread(state.pos);
    [[sp.R, 1], [sp.L, 0]].forEach(([side, isRight]) => {
      if (side.kind !== 'page') return;
      const pg = al.pages[side.i];
      pg.elements.forEach(el => {
        if (!['photo', 'video', 'audio'].includes(el.type)) return;
        if (el.type === 'photo' && !el.photoId) return;
        const b = A.h('button.hs.' + el.type, { type: 'button', 'aria-label': el.type === 'video' ? 'הפעלת סרטון' : el.type === 'audio' ? 'השמעת הקלטה' : 'הגדלת תמונה' });
        b.style.left = (isRight ? 50 : 0) + el.x * 50 + '%';
        b.style.top = el.y * 100 + '%';
        b.style.width = el.w * 50 + '%'; b.style.height = el.h * 100 + '%';
        b.style.transform = 'rotate(' + (el.rot || 0) + 'deg)';
        b._el = el;
        hot.appendChild(b);
      });
    });
  }
  async function hotAction(hs) {
    const el = hs._el;
    if (el.type === 'photo') return V.lightbox(el.photoId);
    if (el.type === 'video' || el.type === 'audio') return V.playMedia(el.mediaId, el.type, el.caption);
  }

  V.playMedia = async function (mediaId, type, caption) {
    const u = await A.cache.url(mediaId + ':data');
    if (!u) return A.alert('הקובץ חסר', 'קובץ המדיה לא נמצא. אפשר להריץ "בדיקת תקינות" מתוך ההגדרות.');
    const m = A.h(type === 'video' ? 'video.media-play' : 'audio.media-play', { src: u, controls: true, autoplay: true, playsinline: true });
    stopMusic(true);
    await A.modal(type === 'video' ? '🎬 סרטון' : '🔊 הקלטה', A.h('div', null, m, caption ? A.h('p.muted', null, caption) : null), [{ label: 'סגירה', value: null }], { wide: type === 'video' });
    m.pause();
    resumeMusic();
  };

  /* תצוגת תמונה בהגדלה עם צביטה */
  V.lightbox = async function (photoId) {
    const p = await A.db.photo(photoId);
    if (!p) return;
    const u = await A.cache.photoUrl(p, 'orig');
    const img = A.h('img.lb-img', { src: u, alt: p.caption || p.name, draggable: false });
    const cap = A.h('div.lb-cap', null, p.caption || '', p.takenAt ? ' · ' + A.fmtDate(p.takenAt) : '');
    const box = A.h('div.lightbox', null, img, cap, A.h('button.lb-x', { type: 'button', 'aria-label': 'סגירה', onclick: () => close() }, '✕'));
    let z = 1, tx = 0, ty = 0;
    const pts = new Map(); let base = null;
    const apply = () => { img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + z + ')'; };
    box.addEventListener('pointerdown', e => { box.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); base = snapshot(); });
    box.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const cur = snapshot();
      if (pts.size >= 2 && base.d) { z = A.clamp(base.z * cur.d / base.d, 1, 6); tx = base.tx + (cur.cx - base.cx); ty = base.ty + (cur.cy - base.cy); }
      else if (pts.size === 1 && z > 1) { tx = base.tx + (cur.cx - base.cx); ty = base.ty + (cur.cy - base.cy); }
      apply();
    });
    const up = e => { pts.delete(e.pointerId); base = snapshot(); if (z <= 1.01) { z = 1; tx = ty = 0; apply(); } };
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    box.addEventListener('dblclick', () => { z = z > 1 ? 1 : 2.5; tx = ty = 0; apply(); });
    function snapshot() { const a = Array.from(pts.values()); if (!a.length) return { z, tx, ty, cx: 0, cy: 0, d: 0 }; const cx = a.reduce((s, p) => s + p.x, 0) / a.length, cy = a.reduce((s, p) => s + p.y, 0) / a.length; return { z, tx, ty, cx, cy, d: a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0 }; }
    document.body.appendChild(box);
    const close = () => { box.remove(); A.backStack.pop(); };
    A.backStack.push(close);
  };

  /* ----- כלים ----- */
  function toggleRotate() {
    state.rotate = !state.rotate;
    A.$('.vbtn.rot', root).classList.toggle('on', state.rotate);
    if (!state.rotate) { state.yaw = 0; state.pitch = 18; book.classList.add('easing'); applyTransform(); setTimeout(() => book.classList.remove('easing'), 600); }
    else A.toast('מצב סיבוב: גררו כדי לבחון את האלבום מכל זווית');
  }
  async function toggleBookmark() {
    const pages = currentPages();
    if (!pages.length) return A.toast('אפשר לסמן רק עמודים פתוחים');
    al.bookmarks = al.bookmarks || [];
    const has = pages.some(i => al.bookmarks.includes(i));
    if (has) al.bookmarks = al.bookmarks.filter(i => !pages.includes(i)); else al.bookmarks.push(pages[0]);
    await A.db.saveAlbum(al);
    updateInfo();
    A.toast(has ? 'הסימנייה הוסרה' : '🔖 העמוד סומן');
  }
  function showBookmarks() {
    const list = (al.bookmarks || []).slice().sort((a, b) => a - b);
    if (!list.length) return A.alert('סימניות', 'עדיין לא סימנתם עמודים. לחצו על 🔖 בעמוד שאהבתם.');
    const box = A.h('div.list');
    let closeFn;
    list.forEach(i => box.appendChild(A.h('button.list-item', { type: 'button', onclick: () => { closeFn(); V.goPage(i); } }, '🔖 עמוד ' + (i + 1))));
    A.modal('סימניות', box, [{ label: 'סגירה', value: null }], { onOpen: (c, close) => { closeFn = close; } });
  }
  function toggleAuto() {
    if (state.auto) return stopAuto();
    const b = A.$('.vbtn.auto', root); b.classList.add('on'); b.querySelector('span').textContent = '⏸️';
    playMusic();
    const tick = async () => {
      if (!state.auto) return;
      if (state.pos > spreadCount()) return stopAuto();
      await flipTo(state.pos + 1);
      state.auto = setTimeout(tick, 4500);
    };
    state.auto = setTimeout(tick, 1200);
  }
  function stopAuto() {
    if (!state || !state.auto) return;
    clearTimeout(state.auto); state.auto = null;
    const b = root && A.$('.vbtn.auto', root);
    if (b) { b.classList.remove('on'); b.querySelector('span').textContent = '▶️'; }
  }
  let music = null, musicWanted = false;
  async function playMusic() {
    if (!al.musicId) return;
    musicWanted = true;
    if (!music) { const u = await A.cache.url(al.musicId + ':data'); if (!u) return; music = new Audio(u); music.loop = true; music.volume = 0.6; }
    music.play().catch(() => {});
    const b = A.$('.vbtn.music', root); if (b) b.classList.add('on');
  }
  function stopMusic(temp) { if (music) music.pause(); if (!temp) { musicWanted = false; const b = root && A.$('.vbtn.music', root); if (b) b.classList.remove('on'); } }
  function resumeMusic() { if (musicWanted) playMusic(); }
  function toggleMusic() { if (music && !music.paused) stopMusic(); else playMusic(); }
  function editCurrent() {
    const pages = currentPages();
    A.router.go('editor', { albumId: al.id, page: pages.length ? pages[pages.length - 1] : 0 });
  }

  /* ----- בדיקת מנוע הדפדוף (לאבחון) ----- */
  V.selfTest = async function () {
    const testAl = A.model.newAlbum({ name: 'בדיקה', pageCount: 4 });
    const host = A.h('div', { style: { position: 'fixed', left: '-5000px', top: '0', width: '800px', height: '600px' } });
    document.body.appendChild(host);
    const saved = { al, root, stage, book, halfR, halfL, leafHost, hot, shadowEl, info, state };
    try {
      const el = await V.open(testAl);
      host.appendChild(el);
      const t0 = performance.now();
      const ok1 = await flipTo(1);
      const ok2 = await flipTo(2);
      const ok3 = await flipTo(1);
      const ms = performance.now() - t0;
      V.close();
      return { ok: ok1 && ok2 && ok3, ms: Math.round(ms) };
    } catch (e) { return { ok: false, err: e.message }; }
    finally {
      host.remove();
      ({ al, root, stage, book, halfR, halfL, leafHost, hot, shadowEl, info, state } = saved);
    }
  };
})();
