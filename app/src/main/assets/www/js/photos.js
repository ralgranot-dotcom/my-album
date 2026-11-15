/* האלבום שלי — ייבוא תמונות, EXIF, תמונות ממוזערות וניתוח איכות */
'use strict';
A.photos = {};

/* ---- קריאת EXIF (תאריך צילום ומיקום) מקובץ JPEG ---- */
A.photos.readExif = async function (file) {
  const out = {};
  try {
    if (!/jpe?g/i.test(file.type) && !/\.jpe?g$/i.test(file.name || '')) return out;
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xFFD8) return out;
    let off = 2;
    while (off < v.byteLength - 4) {
      const marker = v.getUint16(off);
      const len = v.getUint16(off + 2);
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) { parseTiff(v, off + 10, out); break; }
      if ((marker & 0xFF00) !== 0xFF00) break;
      off += 2 + len;
    }
  } catch (e) { /* EXIF פגום — מתעלמים */ }
  return out;

  function parseTiff(v, start, out) {
    const le = v.getUint16(start) === 0x4949;
    const u16 = o => v.getUint16(start + o, le), u32 = o => v.getUint32(start + o, le);
    const str = (o, n) => { let s = ''; for (let i = 0; i < n - 1; i++) { const c = v.getUint8(start + o + i); if (!c) break; s += String.fromCharCode(c); } return s; };
    const rat = o => u32(o) / (u32(o + 4) || 1);
    const ifd = (o, cb) => { const n = u16(o); for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; cb(u16(e), u16(e + 2), u32(e + 4), e + 8); } };
    let exifPtr = 0, gpsPtr = 0;
    ifd(u32(4), (tag, type, cnt, vo) => {
      if (tag === 0x8769) exifPtr = u32(vo);
      if (tag === 0x8825) gpsPtr = u32(vo);
      if (tag === 0x0132 && !out.date) out.date = str(cnt > 4 ? u32(vo) : vo, cnt);
    });
    if (exifPtr) ifd(exifPtr, (tag, type, cnt, vo) => { if (tag === 0x9003) out.date = str(u32(vo), cnt); });
    if (gpsPtr) {
      const g = {};
      ifd(gpsPtr, (tag, type, cnt, vo) => {
        if (tag === 1) g.latRef = String.fromCharCode(v.getUint8(start + vo));
        if (tag === 3) g.lonRef = String.fromCharCode(v.getUint8(start + vo));
        if (tag === 2 || tag === 4) { const p = u32(vo); const d = rat(p) + rat(p + 8) / 60 + rat(p + 16) / 3600; g[tag] = d; }
      });
      if (g[2] && g[4]) out.gps = { lat: g[2] * (g.latRef === 'S' ? -1 : 1), lon: g[4] * (g.lonRef === 'W' ? -1 : 1) };
    }
    if (out.date) {
      const m = out.date.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
      out.date = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null;
      if (out.date && (isNaN(out.date) || out.date < 0)) out.date = null;
    }
  }
};

/* ---- ניתוח: גיבוב חזותי (dHash), חדות, בהירות ---- */
A.photos.analyze = function (src) {
  const c = A.canvas(9, 8), g = c.getContext('2d');
  g.drawImage(src, 0, 0, 9, 8);
  const d = g.getImageData(0, 0, 9, 8).data;
  let hash = '';
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) {
      const i = (y * 9 + x) * 4, j = i + 4;
      const a = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11, b = d[j] * .3 + d[j + 1] * .59 + d[j + 2] * .11;
      byte = (byte << 1) | (a > b ? 1 : 0);
    }
    hash += byte.toString(16).padStart(2, '0');
  }
  /* חדות: שונות לפלסיאן על גרסה של 256 פיקסלים */
  const S = 256, sw = src.width, sh = src.height, sc = S / Math.max(sw, sh);
  const W = Math.max(8, Math.round(sw * sc)), H = Math.max(8, Math.round(sh * sc));
  const c2 = A.canvas(W, H), g2 = c2.getContext('2d');
  g2.drawImage(src, 0, 0, W, H);
  const p = g2.getImageData(0, 0, W, H).data;
  const L = new Float32Array(W * H);
  let sum = 0, dark = 0, bright = 0;
  for (let i = 0; i < W * H; i++) { const l = p[i * 4] * .3 + p[i * 4 + 1] * .59 + p[i * 4 + 2] * .11; L[i] = l; sum += l; if (l < 25) dark++; if (l > 235) bright++; }
  let lv = 0, lm = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const lap = L[i - 1] + L[i + 1] + L[i - W] + L[i + W] - 4 * L[i];
    lm += lap; lv += lap * lap; n++;
  }
  lm /= n || 1;
  const sharp = n ? (lv / n - lm * lm) : 0;
  return { hash, sharpness: Math.round(sharp), brightness: Math.round(sum / (W * H)), clipDark: dark / (W * H), clipBright: bright / (W * H) };
};
A.photos.hamming = (a, b) => {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i += 2) { let x = parseInt(a.substr(i, 2), 16) ^ parseInt(b.substr(i, 2), 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
};
/* ציון איכות 0–100 */
A.photos.quality = p => {
  const sharp = Math.min(1, Math.log10(1 + (p.sharpness || 0)) / 3);
  const expo = 1 - Math.min(1, Math.abs((p.brightness || 128) - 128) / 110);
  const clip = 1 - Math.min(1, (p.clipDark || 0) * 2 + (p.clipBright || 0) * 2);
  const res = Math.min(1, ((p.w || 0) * (p.h || 0)) / 8e6);
  return Math.round((sharp * 0.45 + expo * 0.25 + clip * 0.15 + res * 0.15) * 100);
};

/* ---- יצירת גרסאות תצוגה ---- */
A.photos.makeVariants = async function (blob) {
  const disp = await A.decode(blob, 2048);
  const w0 = disp.width, h0 = disp.height;
  const dispBlob = await A.canvasToBlob(disp instanceof HTMLCanvasElement ? disp : toCanvas(disp), 'image/jpeg', 0.9);
  const thumbC = A.canvas(Math.round(w0 * Math.min(1, 400 / Math.max(w0, h0))), Math.round(h0 * Math.min(1, 400 / Math.max(w0, h0))));
  const tg = thumbC.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(disp, 0, 0, thumbC.width, thumbC.height);
  const thumbBlob = await A.canvasToBlob(thumbC, 'image/jpeg', 0.82);
  const an = A.photos.analyze(disp);
  if (disp.close) disp.close();
  return { dispBlob, thumbBlob, an };
  function toCanvas(bmp) { const c = A.canvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0); return c; }
};

/* מידות מקור אמיתיות */
A.photos.dims = async function (blob) {
  try { const b = await createImageBitmap(blob, { imageOrientation: 'from-image' }); const r = { w: b.width, h: b.height }; b.close(); return r; }
  catch (e) { const im = await A.blobToImage(blob); return { w: im.naturalWidth, h: im.naturalHeight }; }
};

/* ייבוא קבצים — מחזיר רשימת רשומות תמונה */
A.photos.importFiles = async function (files, opts) {
  opts = opts || {};
  const imgs = files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name));
  if (!imgs.length) return [];
  const pr = imgs.length > 1 || opts.progress !== false ? A.progress('מוסיף תמונות…') : null;
  const out = [], failed = [];
  for (let i = 0; i < imgs.length; i++) {
    if (pr && pr.cancelled) break;
    const f = imgs[i];
    if (pr) pr.set(i / imgs.length, (i + 1) + ' מתוך ' + imgs.length + ': ' + (f.name || ''));
    try {
      const exif = await A.photos.readExif(f);
      const dims = await A.photos.dims(f);
      const v = await A.photos.makeVariants(f);
      const id = A.uid();
      const rec = {
        id, kind: opts.kind || 'photo', name: f.name || 'תמונה', mime: f.type || 'image/jpeg', size: f.size,
        w: dims.w, h: dims.h, addedAt: Date.now(), fileDate: f.lastModified || Date.now(),
        takenAt: exif.date || null, gps: exif.gps || null, caption: '', tags: [],
        hash: v.an.hash, sharpness: v.an.sharpness, brightness: v.an.brightness, clipDark: v.an.clipDark, clipBright: v.an.clipBright,
        hasEdit: false, edits: null
      };
      rec.quality = A.photos.quality(rec);
      await A.db.tx(['photos', 'blobs'], 'readwrite', ([p, b]) => {
        p.put(rec); b.put(f, id + ':orig'); b.put(v.dispBlob, id + ':disp'); b.put(v.thumbBlob, id + ':thumb');
      });
      out.push(rec);
    } catch (e) { console.warn(e); failed.push(f.name || ('קובץ ' + (i + 1))); }
  }
  if (pr) pr.done();
  if (failed.length) A.toast('לא ניתן היה לקרוא ' + failed.length + ' קבצים (פורמט לא נתמך או קובץ פגום)', 4000);
  return out;
};

/* שמירת תמונה שנוצרה באפליקציה (קולא׳, חתימה, סריקה) */
A.photos.addGenerated = async function (blob, name, kind) {
  const file = new File([blob], name, { type: blob.type || 'image/jpeg', lastModified: Date.now() });
  const r = await A.photos.importFiles([file], { kind: kind || 'photo', progress: false });
  return r[0];
};

A.photos.date = p => p ? (p.takenAt || p.fileDate || p.addedAt) : 0;

/* ---- מדיה: וידאו ושמע ---- */
A.media = {};
A.media.add = async function (blob, type, name) {
  const id = A.uid();
  const rec = { id, type, name: name || (type === 'video' ? 'סרטון' : 'הקלטה'), mime: blob.type, size: blob.size, addedAt: Date.now(), duration: 0 };
  let poster = null;
  try {
    const url = URL.createObjectURL(blob);
    const el = document.createElement(type === 'video' ? 'video' : 'audio');
    el.preload = 'metadata'; el.muted = true; el.src = url;
    await new Promise((res, rej) => { el.onloadedmetadata = res; el.onerror = () => rej(new Error('קובץ מדיה לא נתמך')); setTimeout(res, 6000); });
    rec.duration = isFinite(el.duration) ? el.duration : 0;
    if (type === 'video') {
      rec.w = el.videoWidth; rec.h = el.videoHeight;
      el.currentTime = Math.min(1, (rec.duration || 2) / 3);
      await new Promise(res => { el.onseeked = res; setTimeout(res, 3000); });
      if (el.videoWidth) {
        const s = Math.min(1, 800 / Math.max(el.videoWidth, el.videoHeight));
        const c = A.canvas(el.videoWidth * s, el.videoHeight * s);
        c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
        poster = await A.canvasToBlob(c, 'image/jpeg', 0.85);
      }
    }
    URL.revokeObjectURL(url);
  } catch (e) { if (type === 'video') throw e; }
  await A.db.tx(['media', 'blobs'], 'readwrite', ([m, b]) => { m.put(rec); b.put(blob, id + ':data'); if (poster) b.put(poster, id + ':poster'); });
  return rec;
};

/* הקלטת קול מהמיקרופון */
A.media.record = function () {
  return new Promise(async resolve => {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { A.alert('אין גישה למיקרופון', 'יש לאשר לאפליקציה גישה למיקרופון כדי להקליט.'); return resolve(null); }
    const chunks = [];
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const timer = A.h('div.rec-timer', null, '00:00');
    const dot = A.h('div.rec-dot');
    let t0 = Date.now();
    const iv = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); timer.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }, 250);
    rec.start(250);
    const v = await A.modal('🎙️ הקלטה', A.h('div.rec-box', null, dot, timer, A.h('p.muted', null, 'דברו בקול ברור. לחצו "סיום" כשתסיימו.')), [
      { label: 'ביטול', value: false }, { label: '⏹️ סיום ושמירה', value: true, cls: 'primary' }
    ], { sticky: true });
    clearInterval(iv);
    await new Promise(r => { rec.onstop = r; try { rec.stop(); } catch (e) { r(); } });
    stream.getTracks().forEach(t => t.stop());
    if (!v || !chunks.length) return resolve(null);
    resolve(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }));
  });
};
