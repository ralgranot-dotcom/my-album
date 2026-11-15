/* האלבום שלי — גיבוי ושחזור (עם הצפנה), העברת אלבום, קובצי ZIP */
'use strict';

/* ---------- CRC32 + ZIP (לייצוא תמונות) ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8, crc) { crc = crc == null ? 0xFFFFFFFF : crc; for (let i = 0; i < u8.length; i++) crc = CRC_T[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8); return crc; }
A.zip = {
  async make(files) {
    const parts = [], central = [];
    let off = 0;
    const enc = new TextEncoder();
    for (const f of files) {
      const data = new Uint8Array(await f.blob.arrayBuffer());
      const crc = (crc32(data) ^ 0xFFFFFFFF) >>> 0;
      const name = enc.encode(f.name);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(lh.buffer, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(ch.buffer, name);
      off += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((s, b) => s + (b.byteLength || b.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
  }
};

/* ---------- פורמט הגיבוי ----------
   MYALBUM1\n  ואחריו רשומות: [u32 אורך שם][שם][f64 גודל][נתונים]
   בגיבוי מוצפן: MYALBUMENC1 + מלח(16) ואחריו מסגרות: [u32 אורך][iv 12][מוצפן] */
const MAGIC = 'MYALBUM1\n', MAGIC_ENC = 'MYALBUMENC1';
async function deriveKey(pass, salt) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

A.backup = {};
/* כותב רשומות; אם יש סיסמה — מצפין במסגרות של 4 מ״ב */
A.backup.writer = async function (sink, password) {
  const enc = new TextEncoder();
  let key = null, buf = [], bufLen = 0;
  const FRAME = 4 * 1048576;
  if (password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    key = await deriveKey(password, salt);
    await sink.write(enc.encode(MAGIC_ENC)); await sink.write(salt);
  }
  const flush = async force => {
    while (bufLen >= FRAME || (force && bufLen)) {
      const take = Math.min(FRAME, bufLen);
      const plain = new Uint8Array(take);
      let o = 0;
      while (o < take) { const b = buf[0], n = Math.min(b.length, take - o); plain.set(b.subarray(0, n), o); o += n; if (n === b.length) buf.shift(); else buf[0] = b.subarray(n); }
      bufLen -= take;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
      const hdr = new DataView(new ArrayBuffer(4)); hdr.setUint32(0, ct.length);
      await sink.write(new Uint8Array(hdr.buffer)); await sink.write(iv); await sink.write(ct);
    }
  };
  const out = async u8 => { if (!key) return sink.write(u8); buf.push(u8); bufLen += u8.length; if (bufLen >= FRAME) await flush(false); };
  await out(enc.encode(MAGIC));
  return {
    async add(name, blobOrU8) {
      const nm = enc.encode(name);
      const size = blobOrU8.size != null ? blobOrU8.size : blobOrU8.length;
      const h = new DataView(new ArrayBuffer(4 + nm.length + 8));
      h.setUint32(0, nm.length); new Uint8Array(h.buffer).set(nm, 4); h.setFloat64(4 + nm.length, size);
      await out(new Uint8Array(h.buffer));
      if (blobOrU8.size != null) {
        const CH = 2 * 1048576;
        for (let o = 0; o < size; o += CH) await out(new Uint8Array(await blobOrU8.slice(o, o + CH).arrayBuffer()));
      } else await out(blobOrU8);
    },
    async end() { await flush(true); }
  };
};

/* קורא רשומות מתוך קובץ (עם פענוח במידת הצורך) */
A.backup.reader = async function (file, password) {
  const head = new Uint8Array(await file.slice(0, 27).arrayBuffer());
  const dec = new TextDecoder();
  const isEnc = dec.decode(head.subarray(0, MAGIC_ENC.length)) === MAGIC_ENC;
  if (!isEnc && dec.decode(head.subarray(0, MAGIC.length)) !== MAGIC) throw new Error('הקובץ אינו גיבוי של "האלבום שלי"');
  if (isEnc && !password) return { needsPassword: true };
  let pos = 0, key = null;
  if (isEnc) { const salt = head.slice(MAGIC_ENC.length, MAGIC_ENC.length + 16); key = await deriveKey(password, salt); pos = MAGIC_ENC.length + 16; }
  /* מקור בתים רציף */
  let pending = [], plen = 0;
  async function more() {
    if (pos >= file.size) return false;
    if (!key) { const n = Math.min(4 * 1048576, file.size - pos); pending.push(new Uint8Array(await file.slice(pos, pos + n).arrayBuffer())); plen += n; pos += n; return true; }
    const lenB = new DataView(await file.slice(pos, pos + 4).arrayBuffer()); const len = lenB.getUint32(0);
    const iv = new Uint8Array(await file.slice(pos + 4, pos + 16).arrayBuffer());
    const ct = await file.slice(pos + 16, pos + 16 + len).arrayBuffer();
    pos += 16 + len;
    let plain;
    try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)); }
    catch (e) { throw new Error('סיסמה שגויה או קובץ גיבוי פגום'); }
    pending.push(plain); plen += plain.length; return true;
  }
  async function take(n) {
    while (plen < n) if (!(await more())) throw new Error('קובץ הגיבוי קטוע');
    const out = new Uint8Array(n); let o = 0;
    while (o < n) { const b = pending[0], k = Math.min(b.length, n - o); out.set(b.subarray(0, k), o); o += k; if (k === b.length) pending.shift(); else pending[0] = b.subarray(k); }
    plen -= n; return out;
  }
  async function eof() { if (plen) return false; return !(await more()); }
  const magic = dec.decode(await take(MAGIC.length));
  if (magic !== MAGIC) throw new Error(isEnc ? 'סיסמה שגויה' : 'קובץ גיבוי פגום');
  return {
    encrypted: isEnc,
    progress: () => pos / file.size,
    async next() {
      if (await eof()) return null;
      const nl = new DataView((await take(4)).buffer).getUint32(0);
      const name = dec.decode(await take(nl));
      const size = new DataView((await take(8)).buffer).getFloat64(0);
      return { name, size, read: async () => take(size) };
    }
  };
};

/* יצירת גיבוי: כל המאגר או אלבום יחיד */
A.backup.create = async function (opts) {
  opts = opts || {};
  let albums = await A.db.albums();
  if (opts.albumId) albums = albums.filter(a => a.id === opts.albumId);
  const pIds = new Set(), mIds = new Set();
  albums.forEach(a => { A.model.photoIds(a).forEach(i => pIds.add(i)); A.model.mediaIds(a).forEach(i => mIds.add(i)); });
  let photos = await A.db.photos(), media = await A.db.all('media');
  if (opts.albumId) { photos = photos.filter(p => pIds.has(p.id)); media = media.filter(m => mIds.has(m.id)); }
  const stamp = new Date(); const ds = stamp.getFullYear() + '-' + String(stamp.getMonth() + 1).padStart(2, '0') + '-' + String(stamp.getDate()).padStart(2, '0');
  const fname = opts.albumId ? A.safeName(albums[0].name) + '.myalbum' : 'גיבוי_האלבום_שלי_' + ds + (opts.password ? '_מוצפן' : '') + '.myalbum';
  const sink = opts.sink || A.fileSink(fname, 'application/octet-stream');
  const pr = A.progress(opts.albumId ? 'אורז את האלבום…' : 'יוצר גיבוי…');
  try {
    const w = await A.backup.writer(sink, opts.password);
    const meta = { app: 'my-album', version: A.VERSION, created: Date.now(), kind: opts.albumId ? 'album' : 'full', counts: { albums: albums.length, photos: photos.length, media: media.length } };
    await w.add('manifest.json', new TextEncoder().encode(JSON.stringify(meta)));
    await w.add('data.json', new TextEncoder().encode(JSON.stringify({ albums, photos, media, settings: opts.albumId ? null : collectSettings() })));
    const keys = [];
    photos.forEach(p => ['orig', 'disp', 'thumb', 'edit', 'editdisp', 'editthumb'].forEach(k => keys.push(p.id + ':' + k)));
    media.forEach(m => keys.push(m.id + ':data', m.id + ':poster'));
    let missing = 0;
    for (let i = 0; i < keys.length; i++) {
      if (pr.cancelled) { sink.abort(); pr.done(); return null; }
      pr.set(i / keys.length, 'קובץ ' + (i + 1) + ' מתוך ' + keys.length);
      const b = await A.db.blob(keys[i]);
      if (!b) { if (/:(orig|disp|thumb|data)$/.test(keys[i])) missing++; continue; }
      await w.add('blob/' + keys[i], b);
    }
    await w.end();
    pr.set(1, 'שומר…');
    const res = await sink.close(opts.action || 'save');
    pr.done();
    try { localStorage.setItem('lastBackup', String(Date.now())); } catch (e) { /* */ }
    return { file: fname, size: sink.size, where: res, missing };
  } catch (e) { sink.abort(); pr.done(); throw e; }
};
function collectSettings() { const o = {}; Object.keys(A.settings._d).concat(['sort']).forEach(k => { o[k] = A.settings.get(k); }); return o; }

/* שחזור */
A.backup.restore = async function (file) {
  let r = await A.backup.reader(file);
  let pass = null;
  if (r.needsPassword) {
    pass = await A.prompt('🔐 גיבוי מוצפן', 'הקלידו את הסיסמה של הגיבוי', '', 'password');
    if (!pass) return;
    r = await A.backup.reader(file, pass);
  }
  let man = null, data = null;
  const pr = A.progress('קורא את הגיבוי…');
  try {
    const first = await r.next(); man = JSON.parse(new TextDecoder().decode(await first.read()));
    const second = await r.next(); data = JSON.parse(new TextDecoder().decode(await second.read()));
  } catch (e) { pr.done(); throw e; }
  pr.done();
  const existing = new Set((await A.db.albums()).map(a => a.id));
  const clash = data.albums.filter(a => existing.has(a.id)).length;
  const body = A.h('div', null, A.h('p', null, (man.kind === 'album' ? 'קובץ אלבום' : 'גיבוי מלא') + ' מתאריך ' + A.fmtDate(man.created)),
    A.h('ul.info', null, A.h('li', null, data.albums.length + ' אלבומים'), A.h('li', null, data.photos.length + ' תמונות'), A.h('li', null, data.media.length + ' קובצי מדיה')),
    clash ? A.h('p.muted', null, clash + ' אלבומים כבר קיימים במכשיר.') : null);
  const btns = [{ label: 'ביטול', value: null }, { label: '➕ הוספה לקיים', value: 'merge', cls: 'primary' }];
  if (clash) btns.splice(1, 0, { label: '📋 כעותקים', value: 'copy' });
  if (man.kind !== 'album') btns.push({ label: '♻️ החלפת הכול', value: 'replace', cls: 'danger' });
  const mode = await A.modal('שחזור', body, btns);
  if (!mode) return;
  if (mode === 'replace' && !(await A.confirm('החלפת הכול', 'כל האלבומים והתמונות שבמכשיר יימחקו ויוחלפו בתוכן הגיבוי. להמשיך?', 'החלפה', true))) return;
  r = await A.backup.reader(file, pass);
  await (await r.next()).read(); await (await r.next()).read();
  const pr2 = A.progress('משחזר…');
  try {
    if (mode === 'replace') { for (const s of ['albums', 'photos', 'media', 'blobs']) await A.db.clear(s); A.cache.urls.clear(); }
    const havePhotos = new Set(mode === 'replace' ? [] : await A.db.keys('photos'));
    let e, n = 0;
    while ((e = await r.next())) {
      if (pr2.cancelled) break;
      pr2.set(r.progress(), 'משחזר קבצים… ' + (++n));
      const bytes = await e.read();
      if (!e.name.startsWith('blob/')) continue;
      const key = e.name.slice(5);
      const id = key.split(':')[0];
      if (havePhotos.has(id)) continue; /* כבר קיים — לא דורסים */
      const p = data.photos.find(x => x.id === id), m = data.media.find(x => x.id === id);
      const type = /:(orig|edit)$/.test(key) ? (p && p.mime) || 'image/jpeg' : /:data$/.test(key) ? (m && m.mime) || '' : 'image/jpeg';
      await A.db.putBlob(key, new Blob([bytes], { type }));
    }
    for (const p of data.photos) if (!havePhotos.has(p.id)) await A.db.savePhoto(p);
    for (const m of data.media) await A.db.put('media', m);
    for (const a of data.albums) {
      if (mode === 'copy' && existing.has(a.id)) { a.id = A.uid(); a.name += ' (משוחזר)'; }
      await A.db.put('albums', a);
    }
    if (mode === 'replace' && data.settings) Object.entries(data.settings).forEach(([k, v]) => A.settings.set(k, v));
    pr2.done();
    A.viewer.invalidate();
    await A.alert('✅ השחזור הושלם', data.albums.length + ' אלבומים ו-' + data.photos.length + ' תמונות שוחזרו.');
    A.applyTheme();
    A.router.home();
  } catch (err) { pr2.done(); throw err; }
};

A.backup.exportAlbum = async function (al) {
  try {
    const r = await A.backup.create({ albumId: al.id, action: 'share' });
    if (r) A.toast('📲 קובץ האלבום מוכן. במכשיר השני: גיבוי ושחזור ← שחזור / ייבוא', 5000);
  } catch (e) { A.alert('היצוא נכשל', e.message); }
};

/* ================= מסך גיבוי ושחזור ================= */
A.screens.backup = async function () {
  const s = A.h('div.screen');
  s.appendChild(A.header('💾 גיבוי ושחזור'));
  const last = +localStorage.getItem('lastBackup') || 0;
  const est = await A.db.estimate();
  s.append(
    A.h('section.card', null, A.h('h2', null, 'יצירת גיבוי'),
      A.h('p', null, 'הגיבוי כולל את כל האלבומים, העיצובים, התמונות המקוריות והערוכות, הסרטונים וההקלטות.'),
      A.h('p.muted', null, (last ? 'גיבוי אחרון: ' + A.fmtDate(last) : 'עדיין לא נוצר גיבוי.') + (est ? ' · נפח משוער: ' + A.fmtBytes(est.usage) : '')),
      A.h('button.btn.primary', { type: 'button', onclick: () => go(false, 'save') }, '💾 גיבוי לקובץ במכשיר'),
      A.h('button.btn', { type: 'button', onclick: () => go(true, 'save') }, '🔐 גיבוי מוצפן בסיסמה'),
      A.h('button.btn', { type: 'button', onclick: () => go(true, 'share') }, '📤 גיבוי מוצפן ושיתוף ל-Google Drive וכד׳')),
    A.h('section.card', null, A.h('h2', null, '☁️ גיבוי לענן'),
      A.h('p', null, 'גיבוי ישיר לענן של האפליקציה, מוצפן במכשיר בסיסמה שלכם. לשחזור במכשיר חדש צריך את קוד השחזור ואת הסיסמה.'),
      A.h('p.muted', null, (+localStorage.getItem('lastCloudBackup') ? 'גיבוי אחרון לענן: ' + A.fmtDate(+localStorage.getItem('lastCloudBackup'), true) : 'עדיין לא בוצע גיבוי לענן מהמכשיר הזה.')),
      A.h('button.btn.primary', { type: 'button', onclick: () => A.cloud.backupUp() }, '☁️ גיבוי לענן עכשיו'),
      localStorage.getItem('cloudBackup') ? A.h('button.btn', { type: 'button', onclick: () => A.cloud.showBackupCode(JSON.parse(localStorage.getItem('cloudBackup'))) }, '🔑 הצגת קוד השחזור') : null,
      A.h('button.btn', { type: 'button', onclick: () => A.cloud.backupDown() }, '📥 שחזור מהענן (עם קוד שחזור)'),
      localStorage.getItem('cloudBackup') ? A.h('button.btn', { type: 'button', onclick: () => A.cloud.forgetBackup() }, '🗑️ מחיקת הגיבוי מהענן') : null),
    A.h('section.card', null, A.h('h2', null, 'שחזור / ייבוא אלבום'),
      A.h('p', null, 'בחרו קובץ גיבוי (‎.myalbum) או קובץ אלבום שהועבר ממכשיר אחר.'),
      A.h('button.btn.primary', { type: 'button', onclick: restore }, '📂 בחירת קובץ לשחזור')),
    A.h('section.card', null, A.h('h2', null, 'העברת אלבום יחיד למכשיר אחר'),
      A.h('button.btn', { type: 'button', onclick: () => A.chooseAlbum('איזה אלבום להעביר?', async al => { if (await A.security.unlockAlbum(al)) A.backup.exportAlbum(al); }) }, '📲 בחירת אלבום')));
  return s;

  async function go(encrypt, action) {
    let password = null;
    if (encrypt) {
      const p1 = A.h('input.inp', { type: 'password', autocomplete: 'new-password' }), p2 = A.h('input.inp', { type: 'password', autocomplete: 'new-password' });
      const v = await A.modal('🔐 סיסמה לגיבוי', A.h('div.form', null, A.h('label.field', null, A.h('span', null, 'סיסמה (לפחות 6 תווים)'), p1), A.h('label.field', null, A.h('span', null, 'אימות סיסמה'), p2), A.h('p.muted', null, '⚠️ בלי הסיסמה לא ניתן יהיה לשחזר. שמרו אותה במקום בטוח.')),
        [{ label: 'ביטול', value: null }, { label: 'המשך', cls: 'primary', value: () => p1.value, validate: () => { if (p1.value.length < 6) { A.toast('הסיסמה קצרה מדי'); return false; } if (p1.value !== p2.value) { A.toast('הסיסמאות אינן תואמות'); return false; } return true; } }]);
      if (!v) return;
      password = v;
    }
    try {
      const r = await A.backup.create({ password, action });
      if (!r) return;
      await A.alert('✅ הגיבוי הושלם', A.h('div', null, A.h('p', null, r.file), A.h('p.muted', null, 'גודל: ' + A.fmtBytes(r.size) + (action === 'save' ? ' · נשמר: ' + r.where : '')), r.missing ? A.h('p', null, '⚠️ ' + r.missing + ' קבצים חסרים לא נכללו. מומלץ להריץ בדיקת תקינות.') : null));
      A.router.refresh();
    } catch (e) { A.alert('הגיבוי נכשל', e.message); }
  }
  async function restore() {
    const files = await A.pickFiles('*/*', false);
    if (!files.length) return;
    try { await A.backup.restore(files[0]); } catch (e) { A.alert('השחזור נכשל', e.message); }
  }
};
