/* האלבום שלי — כלי עזר כלליים */
'use strict';
window.A = window.A || {};

A.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
A.$ = (sel, root) => (root || document).querySelector(sel);
A.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
A.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
A.sleep = ms => new Promise(r => setTimeout(r, ms));
A.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* יצירת אלמנט: h('div.cls#id', {attrs}, children) */
A.h = function (tag, attrs, ...kids) {
  const m = tag.match(/^([a-z0-9]+)?([#.][^]*)?$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) m[2].replace(/([#.])([^#.]+)/g, (_, t, v) => { if (t === '#') el.id = v; else el.classList.add(v); });
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
};

const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
A.HEB_MONTHS = HEB_MONTHS;
A.fmtDate = (t, withDay) => {
  if (!t) return '';
  const d = new Date(t);
  return (withDay ? 'יום ' + HEB_DAYS[d.getDay()] + ', ' : '') + d.getDate() + ' ב' + HEB_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
};
A.fmtShortDate = t => { if (!t) return ''; const d = new Date(t); return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear(); };
A.fmtBytes = b => {
  if (b == null || isNaN(b)) return '—';
  const u = ['בתים', 'ק״ב', 'מ״ב', 'ג״ב'];
  let i = 0; while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return (i ? b.toFixed(1) : b) + ' ' + u[i];
};

/* ---------- הודעות קופצות ודיאלוגים ---------- */
A.toast = function (msg, ms) {
  const t = A.h('div.toast', { role: 'status' }, msg);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, ms || 2600);
};

A.modal = function (title, body, buttons, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const back = A.h('div.modal-back');
    const box = A.h('div.modal' + (opts.wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true' });
    const close = v => { back.classList.remove('show'); A.backStack.pop(); setTimeout(() => back.remove(), 250); resolve(v); };
    box.appendChild(A.h('h3', null, title));
    const content = A.h('div.modal-body');
    if (typeof body === 'string') content.innerHTML = body; else if (body) content.appendChild(body);
    box.appendChild(content);
    const bar = A.h('div.modal-btns');
    (buttons || [{ label: 'סגירה', value: null }]).forEach(b => {
      bar.appendChild(A.h('button.btn' + (b.cls ? '.' + b.cls : ''), {
        type: 'button', onclick: () => {
          if (b.validate && !b.validate(content)) return;
          close(typeof b.value === 'function' ? b.value(content) : b.value);
        }
      }, b.label));
    });
    box.appendChild(bar);
    back.appendChild(box);
    back.addEventListener('click', e => { if (e.target === back && !opts.sticky) close(null); });
    document.body.appendChild(back);
    A.backStack.push(() => close(null));
    requestAnimationFrame(() => back.classList.add('show'));
    if (opts.onOpen) opts.onOpen(content, close);
  });
};
A.confirm = (title, msg, okLabel, danger) => A.modal(title, A.h('p', null, msg), [
  { label: 'ביטול', value: false },
  { label: okLabel || 'אישור', value: true, cls: danger ? 'danger' : 'primary' }
]);
A.alert = (title, msg) => A.modal(title, typeof msg === 'string' ? A.h('p', null, msg) : msg, [{ label: 'הבנתי', value: true, cls: 'primary' }]);
A.prompt = (title, label, value, type) => {
  const inp = A.h('input.inp', { type: type || 'text', value: value || '', 'aria-label': label });
  const wrap = A.h('label.field', null, A.h('span', null, label), inp);
  return A.modal(title, wrap, [
    { label: 'ביטול', value: null },
    { label: 'אישור', value: () => inp.value, cls: 'primary' }
  ], { onOpen: () => setTimeout(() => inp.focus(), 80) });
};

/* פס התקדמות לפעולות ארוכות */
A.progress = function (title) {
  const bar = A.h('div.pbar-fill');
  const txt = A.h('div.ptxt', null, '');
  let cancelled = false;
  const box = A.h('div.modal.progress', null, A.h('h3', null, title), A.h('div.pbar', null, bar), txt,
    A.h('div.modal-btns', null, A.h('button.btn', { type: 'button', onclick: () => { cancelled = true; txt.textContent = 'מבטל…'; } }, 'ביטול')));
  const back = A.h('div.modal-back.show', null, box);
  document.body.appendChild(back);
  A.backStack.push(() => { cancelled = true; });
  return {
    set(frac, msg) { bar.style.width = Math.round(A.clamp(frac, 0, 1) * 100) + '%'; if (msg != null) txt.textContent = msg; },
    get cancelled() { return cancelled; },
    done() { A.backStack.pop(); back.remove(); }
  };
};

/* מחסנית "חזרה" עבור כפתור החזרה של אנדרואיד */
A.backStack = [];
A.onBack = function () {
  if (A.backStack.length) { const f = A.backStack[A.backStack.length - 1]; f(); return true; }
  if (A.router && A.router.back()) return true;
  return false;
};

/* ---------- תמונות ---------- */
A.loadImage = src => new Promise((res, rej) => {
  const im = new Image();
  im.onload = () => res(im);
  im.onerror = () => rej(new Error('טעינת תמונה נכשלה'));
  im.src = src;
});
A.blobToImage = async blob => {
  const url = URL.createObjectURL(blob);
  try { return await A.loadImage(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
};
/* פענוח תמונה עם הקטנה אופציונלית (חוסך זיכרון) */
A.decode = async (blob, maxDim) => {
  let bmp;
  try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch (e) { bmp = await A.blobToImage(blob); }
  const w = bmp.width, h = bmp.height;
  if (!maxDim || Math.max(w, h) <= maxDim) return bmp;
  const s = maxDim / Math.max(w, h);
  const c = A.canvas(Math.round(w * s), Math.round(h * s));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return c;
};
A.canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; };
A.canvasToBlob = (c, type, q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('יצירת קובץ תמונה נכשלה')), type || 'image/jpeg', q == null ? 0.9 : q));
A.blobToB64 = blob => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(',')[1] || '');
  fr.onerror = () => rej(fr.error);
  fr.readAsDataURL(blob);
});
A.blobToDataURL = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });

/* בחירת קבצים מהמכשיר */
A.pickFiles = (accept, multiple, capture) => new Promise(resolve => {
  const inp = A.h('input', { type: 'file', accept: accept || 'image/*', style: { display: 'none' } });
  if (multiple) inp.multiple = true;
  if (capture) inp.setAttribute('capture', 'environment');
  let done = false;
  inp.addEventListener('change', () => { done = true; resolve(Array.from(inp.files || [])); inp.remove(); });
  window.addEventListener('focus', function f() {
    window.removeEventListener('focus', f);
    setTimeout(() => { if (!done) { resolve([]); inp.remove(); } }, 1500);
  });
  document.body.appendChild(inp);
  inp.click();
});

/* ---------- גיבוב (PBKDF2) לקוד אישי ---------- */
A.hashPin = async (pin, saltB64) => {
  const enc = new TextEncoder();
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), c => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, key, 256);
  const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a)));
  return { hash: b64(bits), salt: b64(salt) };
};
A.checkPin = async (pin, rec) => { if (!rec) return false; const r = await A.hashPin(pin, rec.salt); return r.hash === rec.hash; };

/* ---------- הגדרות ---------- */
A.settings = {
  _d: { theme: 'auto', textScale: 1, shelf: 'wood', sound: true, quality: 'auto', autoLock: true, lockDelay: 30, secure: false, autoUpdate: true, flipHint: true },
  get(k) { try { const v = JSON.parse(localStorage.getItem('set_' + k)); return v == null ? this._d[k] : v; } catch (e) { return this._d[k]; } },
  set(k, v) { try { localStorage.setItem('set_' + k, JSON.stringify(v)); } catch (e) { /* אחסון מלא */ } }
};

/* צליל דפדוף עדין — מסונתז, ללא קבצים */
A.sound = {
  ctx: null,
  flip() {
    if (!A.settings.get('sound')) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.ctx, dur = 0.42, n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.25)), 1.6) * (1 - t * 0.5);
        d[i] = (Math.random() * 2 - 1) * env * (0.55 + 0.45 * Math.sin(t * 38));
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.6;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
      const g = ctx.createGain(); g.gain.value = 0.16;
      src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(ctx.destination);
      src.start();
    } catch (e) { /* אין שמע */ }
  }
};

/* ---------- גשר לאנדרואיד (עם חלופה לדפדפן) ---------- */
A.native = {
  has: () => !!(window.AndroidBridge),
  call(name, ...args) { try { if (window.AndroidBridge && window.AndroidBridge[name]) return window.AndroidBridge[name](...args); } catch (e) { console.warn(e); } return null; },
  _cbs: {},
  cb(fn) { const id = 'cb_' + A.uid(); this._cbs[id] = fn; return id; },
  resolve(id, a, b) { const f = this._cbs[id]; if (a !== 'progress') delete this._cbs[id]; if (f) f(a, b); }
};
window.__nativeCb = (id, a, b) => A.native.resolve(id, a, b);

/* שמירה / שיתוף של קובץ: action = save | share | whatsapp | email */
A.saveFile = async function (blob, filename, action, prog) {
  action = action || 'save';
  if (A.native.has()) {
    const mime = blob.type || 'application/octet-stream';
    const id = A.native.call('beginFile', filename, mime);
    if (!id) throw new Error('פתיחת קובץ לכתיבה נכשלה');
    const CH = 1536 * 1024;
    for (let off = 0; off < blob.size; off += CH) {
      const b64 = await A.blobToB64(blob.slice(off, off + CH));
      const ok = A.native.call('appendChunk', id, b64);
      if (ok === false) throw new Error('כתיבת הקובץ נכשלה (ייתכן שאין מספיק מקום)');
      if (prog) prog(off / blob.size);
    }
    const res = A.native.call('finishFile', id, action);
    if (!res || String(res).startsWith('ERR')) throw new Error('שמירת הקובץ נכשלה: ' + res);
    return res;
  }
  const url = URL.createObjectURL(blob);
  const a = A.h('a', { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'הורדה בדפדפן';
};

/* כותב קבצים ישירות אל קובץ במכשיר בחלקים (לגיבויים גדולים) */
A.fileSink = function (filename, mime) {
  const parts = [];
  let id = null;
  if (A.native.has()) { id = A.native.call('beginFile', filename, mime); if (!id) throw new Error('פתיחת קובץ נכשלה'); }
  let size = 0;
  return {
    async write(u8) {
      size += u8.length;
      if (!id) { parts.push(u8); return; }
      const CH = 1536 * 1024;
      for (let off = 0; off < u8.length; off += CH) {
        const b64 = await A.blobToB64(new Blob([u8.subarray(off, off + CH)]));
        if (A.native.call('appendChunk', id, b64) === false) throw new Error('כתיבת הקובץ נכשלה (ייתכן שאין מספיק מקום)');
      }
    },
    get size() { return size; },
    async close(action) {
      if (!id) { const b = new Blob(parts, { type: mime }); await A.saveFile(b, filename, action); return b; }
      const r = A.native.call('finishFile', id, action || 'save');
      if (!r || String(r).startsWith('ERR')) throw new Error('שמירת הקובץ נכשלה: ' + r);
      return r;
    },
    abort() { if (id) A.native.call('abortFile', id); }
  };
};

A.safeName = s => String(s || 'album').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 60) || 'album';
