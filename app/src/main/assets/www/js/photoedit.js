/* האלבום שלי — עורך תמונות לא הרסני (קובץ המקור לעולם אינו משתנה) */
'use strict';
A.edit = {};

A.edit.defaults = () => ({
  rot90: 0, flipH: false, straighten: 0, crop: null,
  exposure: 0, brightness: 0, contrast: 0, saturation: 0, temperature: 0, sharpness: 0,
  shadows: 0, denoise: 0, vignette: 0, fade: false, auto: false, filter: 'none', effect: 'none',
  heal: [], redeye: [], overlays: [], frame: 'none', maxDim: 0
});

A.edit.FILTERS = {
  none: 'ללא', vivid: 'חי', warm: 'חם', cool: 'קריר', bw: 'שחור־לבן', bwcontrast: 'שחור־לבן דרמטי', sepia: 'ספיה',
  vintage: 'וינטג׳', fade: 'דהוי רך', film: 'פילם', golden: 'שעת זהב', teal: 'טורקיז־כתום', noir: 'נואר', pastel: 'פסטל'
};
A.edit.EFFECTS = { none: 'ללא', sketch: 'רישום עיפרון', posterize: 'פוסטר', duotone: 'דו־גוני', emboss: 'תבליט', pixel: 'פסיפס', oil: 'ציור שמן' };

/* ---- גאומטריה ---- */
A.edit.geometry = function (src, e, noCrop) {
  const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
  const r90 = ((e.rot90 % 4) + 4) % 4;
  let w = r90 % 2 ? sh : sw, h = r90 % 2 ? sw : sh;
  const c1 = A.canvas(w, h), g = c1.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.translate(w / 2, h / 2);
  g.rotate(r90 * Math.PI / 2 + (e.straighten || 0) * Math.PI / 180);
  if (e.flipH) g.scale(-1, 1);
  if (e.straighten) {
    /* הגדלה כך שלא יופיעו פינות ריקות */
    const a = Math.abs(e.straighten) * Math.PI / 180;
    const k = Math.max((w * Math.cos(a) + h * Math.sin(a)) / w, (w * Math.sin(a) + h * Math.cos(a)) / h);
    g.scale(k, k);
  }
  g.drawImage(src, -sw / 2, -sh / 2, sw, sh);
  if (noCrop || !e.crop) return c1;
  const cx = Math.round(e.crop.x * w), cy = Math.round(e.crop.y * h), cw = Math.max(8, Math.round(e.crop.w * w)), ch = Math.max(8, Math.round(e.crop.h * h));
  const c2 = A.canvas(cw, ch);
  c2.getContext('2d').drawImage(c1, cx, cy, cw, ch, 0, 0, cw, ch);
  return c2;
};

/* ---- פעולות פיקסלים ---- */
function levels(d, perChannel) {
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  const n = d.length / 4;
  const step = Math.max(1, Math.floor(n / 200000));
  let cnt = 0;
  for (let i = 0; i < d.length; i += 4 * step) { hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++; cnt++; }
  const lo = [], hi = [];
  for (let c = 0; c < 3; c++) {
    let acc = 0, l = 0, hgh = 255;
    for (let v = 0; v < 256; v++) { acc += hist[c][v]; if (acc > cnt * 0.005) { l = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[c][v]; if (acc > cnt * 0.005) { hgh = v; break; } }
    lo.push(l); hi.push(Math.max(l + 10, hgh));
  }
  if (!perChannel) { const l = Math.min(...lo), h = Math.max(...hi); return { lo: [l, l, l], hi: [h, h, h] }; }
  return { lo, hi };
}

const FILTER_FN = {
  vivid: (r, g, b) => sat(r, g, b, 1.35),
  warm: (r, g, b) => [r * 1.08 + 8, g * 1.02 + 3, b * 0.9],
  cool: (r, g, b) => [r * 0.92, g * 1.0, b * 1.1 + 8],
  bw: (r, g, b) => { const l = r * .3 + g * .59 + b * .11; return [l, l, l]; },
  bwcontrast: (r, g, b) => { let l = r * .3 + g * .59 + b * .11; l = (l - 128) * 1.45 + 128; return [l, l, l]; },
  sepia: (r, g, b) => [r * .393 + g * .769 + b * .189, r * .349 + g * .686 + b * .168, r * .272 + g * .534 + b * .131],
  vintage: (r, g, b) => { const s = sat(r, g, b, 0.7); return [s[0] * 0.95 + 25, s[1] * 0.9 + 18, s[2] * 0.8 + 20]; },
  fade: (r, g, b) => [r * 0.82 + 34, g * 0.82 + 32, b * 0.82 + 36],
  film: (r, g, b) => { const s = sat(r, g, b, 0.9); return [s[0] * 1.05 + 6, s[1] * 0.98 + 10, s[2] * 0.92 + 18]; },
  golden: (r, g, b) => [r * 1.12 + 14, g * 1.04 + 8, b * 0.82],
  teal: (r, g, b) => { const l = (r * .3 + g * .59 + b * .11) / 255; return [r + (l > 0.5 ? 18 : -10), g + 4, b + (l > 0.5 ? -14 : 22)]; },
  noir: (r, g, b) => { let l = r * .3 + g * .59 + b * .11; l = Math.pow(l / 255, 1.3) * 255; l = (l - 128) * 1.6 + 128; return [l, l, l]; },
  pastel: (r, g, b) => { const s = sat(r, g, b, 0.75); return [s[0] * 0.85 + 40, s[1] * 0.85 + 40, s[2] * 0.85 + 45]; }
};
function sat(r, g, b, k) { const l = r * .3 + g * .59 + b * .11; return [l + (r - l) * k, l + (g - l) * k, l + (b - l) * k]; }

A.edit.pixels = function (c, e) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const W = c.width, H = c.height;
  let im = g.getImageData(0, 0, W, H);
  let d = im.data;
  /* תיקון אוטומטי / שחזור צבעים דהויים */
  let lv = null;
  if (e.fade) lv = levels(d, true);
  else if (e.auto) lv = levels(d, false);
  const ex = Math.pow(2, e.exposure || 0);
  const br = (e.brightness || 0) * 1.2;
  const ct = (e.contrast || 0) / 100, cf = ct >= 0 ? 1 + ct * 1.5 : 1 + ct;
  const st = 1 + (e.saturation || 0) / 100 + (e.auto ? 0.12 : 0) + (e.fade ? 0.2 : 0);
  const tp = (e.temperature || 0) * 0.35;
  const sh = (e.shadows || 0) / 100;
  const ff = FILTER_FN[e.filter];
  /* טבלת המרה לבהירות ומגע */
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], gg = d[i + 1], b = d[i + 2];
    if (lv) { r = (r - lv.lo[0]) * 255 / (lv.hi[0] - lv.lo[0]); gg = (gg - lv.lo[1]) * 255 / (lv.hi[1] - lv.lo[1]); b = (b - lv.lo[2]) * 255 / (lv.hi[2] - lv.lo[2]); }
    r *= ex; gg *= ex; b *= ex;
    if (sh) { const l = (r * .3 + gg * .59 + b * .11) / 255; const lift = sh * 90 * Math.pow(1 - Math.min(1, l), 2.2); r += lift; gg += lift; b += lift; }
    r += br; gg += br; b += br;
    r = (r - 128) * cf + 128; gg = (gg - 128) * cf + 128; b = (b - 128) * cf + 128;
    if (st !== 1) { const l = r * .3 + gg * .59 + b * .11; r = l + (r - l) * st; gg = l + (gg - l) * st; b = l + (b - l) * st; }
    r += tp; b -= tp;
    if (ff) { const o = ff(r, gg, b); r = o[0]; gg = o[1]; b = o[2]; }
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  if (e.denoise > 0) blend(d, blurCopy(d, W, H, Math.max(1, Math.round(W / 900))), e.denoise / 100 * 0.85);
  if (e.sharpness) {
    const bl = blurCopy(d, W, H, Math.max(1, Math.round(W / 700)));
    const k = e.sharpness / 100 * (e.sharpness > 0 ? 1.6 : 1);
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) { const v = d[i + c] + (d[i + c] - bl[i + c]) * k; d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v; }
  }
  (e.redeye || []).forEach(s => {
    const cx = s.x * W, cy = s.y * H, rr = s.r * W;
    for (let y = Math.max(0, cy - rr | 0); y < Math.min(H, cy + rr); y++) for (let x = Math.max(0, cx - rr | 0); x < Math.min(W, cx + rr); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > rr * rr) continue;
      const i = (y * W + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r > 1.4 * ((gg + b) / 2) && r > 60) d[i] = (gg + b) / 2;
    }
  });
  if ((e.heal || []).length) heal(d, W, H, e.heal);
  if (e.effect && e.effect !== 'none') d = effect(d, W, H, e.effect, im);
  if (e.vignette) {
    const k = e.vignette / 100;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2, f = 1 - k * Math.pow(Math.min(1, (dx * dx + dy * dy) / 2), 1.3);
      const i = (y * W + x) * 4; d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
    }
  }
  if (d !== im.data) im = new ImageData(d, W, H);
  g.putImageData(im, 0, 0);
  return c;
};

function blurCopy(d, W, H, r) {
  const tmp = new Float32Array(d.length), out = new Uint8ClampedArray(d.length);
  for (let y = 0; y < H; y++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += d[(y * W + A.clamp(x, 0, W - 1)) * 4 + c];
      for (let x = 0; x < W; x++) {
        tmp[(y * W + x) * 4 + c] = acc / (2 * r + 1);
        acc += d[(y * W + Math.min(W - 1, x + r + 1)) * 4 + c] - d[(y * W + Math.max(0, x - r)) * 4 + c];
      }
    }
  }
  for (let x = 0; x < W; x++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[(A.clamp(y, 0, H - 1) * W + x) * 4 + c];
      for (let y = 0; y < H; y++) {
        out[(y * W + x) * 4 + c] = acc / (2 * r + 1);
        acc += tmp[(Math.min(H - 1, y + r + 1) * W + x) * 4 + c] - tmp[(Math.max(0, y - r) * W + x) * 4 + c];
      }
    }
  }
  for (let i = 3; i < out.length; i += 4) out[i] = d[i];
  return out;
}
function blend(d, b, k) { for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = d[i + c] * (1 - k) + b[i + c] * k; }

/* מחיקת פגמים: מילוי האזור מהשוליים פנימה (דיפוזיה) */
function heal(d, W, H, spots) {
  spots.forEach(s => {
    const cx = s.x * W, cy = s.y * H, rr = Math.max(2, s.r * W);
    const x0 = Math.max(1, Math.floor(cx - rr - 2)), x1 = Math.min(W - 2, Math.ceil(cx + rr + 2));
    const y0 = Math.max(1, Math.floor(cy - rr - 2)), y1 = Math.min(H - 2, Math.ceil(cy + rr + 2));
    const mask = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= rr * rr) mask.push(y * W + x);
    /* אתחול לממוצע הגבול להאצת ההתכנסות */
    const ring = [0, 0, 0]; let rn = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dd = (x - cx) ** 2 + (y - cy) ** 2; if (dd > rr * rr && dd <= (rr + 2) ** 2) { const i = (y * W + x) * 4; ring[0] += d[i]; ring[1] += d[i + 1]; ring[2] += d[i + 2]; rn++; } }
    if (rn) for (const p of mask) for (let c = 0; c < 3; c++) d[p * 4 + c] = ring[c] / rn;
    const iters = Math.min(250, Math.round(rr * 4));
    for (let it = 0; it < iters; it++) for (const p of mask) for (let c = 0; c < 3; c++) {
      const i = p * 4 + c;
      d[i] = (d[i - 4] + d[i + 4] + d[i - W * 4] + d[i + W * 4]) / 4;
    }
    /* מעט רעש כדי שלא ייראה מרוח */
    for (const p of mask) { const n = (Math.random() - 0.5) * 6; for (let c = 0; c < 3; c++) d[p * 4 + c] += n; }
  });
}

function effect(d, W, H, kind) {
  const L = i => d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11;
  if (kind === 'posterize') { const q = 5; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] / 255 * (q - 1)) * 255 / (q - 1); return d; }
  if (kind === 'duotone') { for (let i = 0; i < d.length; i += 4) { const l = L(i) / 255; d[i] = 30 + l * 220; d[i + 1] = 40 + l * 170; d[i + 2] = 90 + l * 110; } return d; }
  if (kind === 'pixel') {
    const s = Math.max(4, Math.round(W / 60));
    for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) {
      const i0 = (y * W + x) * 4;
      for (let yy = y; yy < Math.min(H, y + s); yy++) for (let xx = x; xx < Math.min(W, x + s); xx++) { const i = (yy * W + xx) * 4; d[i] = d[i0]; d[i + 1] = d[i0 + 1]; d[i + 2] = d[i0 + 2]; }
    }
    return d;
  }
  const out = new Uint8ClampedArray(d.length);
  for (let i = 3; i < d.length; i += 4) out[i] = d[i];
  if (kind === 'sketch' || kind === 'emboss') {
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      let v;
      if (kind === 'sketch') {
        const gx = L(i + 4) - L(i - 4), gy = L(i + W * 4) - L(i - W * 4);
        v = 255 - Math.min(255, Math.hypot(gx, gy) * 2.2);
        v = v * 0.85 + L(i) * 0.15;
      } else v = 128 + (L(i + W * 4 + 4) - L(i - W * 4 - 4)) * 1.5;
      out[i] = out[i + 1] = out[i + 2] = v;
    }
    return out;
  }
  if (kind === 'oil') {
    const r = Math.max(2, Math.round(W / 400)), lvls = 20;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const cnt = new Uint16Array(lvls), sr = new Uint32Array(lvls), sg = new Uint32Array(lvls), sb = new Uint32Array(lvls);
      for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) {
        const i = (yy * W + xx) * 4, k = Math.min(lvls - 1, (L(i) / 256 * lvls) | 0);
        cnt[k]++; sr[k] += d[i]; sg[k] += d[i + 1]; sb[k] += d[i + 2];
      }
      let best = 0; for (let k = 1; k < lvls; k++) if (cnt[k] > cnt[best]) best = k;
      const o = (y * W + x) * 4; out[o] = sr[best] / cnt[best]; out[o + 1] = sg[best] / cnt[best]; out[o + 2] = sb[best] / cnt[best];
    }
    return out;
  }
  return d;
}

/* ---- שכבות: מסגרת, טקסט, מדבקה, תאריך, חתימה ---- */
A.edit.overlays = async function (c, e, photo) {
  const g = c.getContext('2d'), W = c.width, H = c.height, S = Math.min(W, H);
  for (const o of e.overlays || []) {
    g.save();
    g.translate(o.x * W, o.y * H);
    g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (o.type === 'text' || o.type === 'date') {
      const fs = o.size * S;
      g.font = (o.bold ? 'bold ' : '') + fs + 'px ' + (o.type === 'date' ? '"Courier New", monospace' : (A.render.FONTS[o.font] || A.render.FONTS.sans)[1]);
      const txt = o.type === 'date' ? A.fmtShortDate(A.photos.date(photo)) : o.text;
      if (o.type === 'date') { g.shadowColor = 'rgba(255,120,0,0.8)'; g.shadowBlur = fs * 0.3; }
      else { g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = fs * 0.12; g.shadowOffsetY = fs * 0.04; }
      g.fillStyle = o.color || (o.type === 'date' ? '#ff9a1f' : '#ffffff');
      g.fillText(txt, 0, 0, W * 0.95);
    } else if (o.type === 'sticker') {
      const fs = o.size * S;
      g.font = fs + 'px "Noto Color Emoji", sans-serif'; g.fillText(o.emoji, 0, 0);
    } else if (o.type === 'signature' && o.photoId) {
      const im = await A.render.getImg(o.photoId, 'disp');
      if (im) { const w = o.size * S * 3, h = w * im.height / im.width; g.drawImage(im, -w / 2, -h / 2, w, h); }
    }
    g.restore();
  }
  if (e.frame && e.frame !== 'none') {
    const b = S * 0.035;
    g.save();
    if (e.frame === 'white' || e.frame === 'polaroid') {
      const c2 = A.canvas(W + b * 2, H + b * (e.frame === 'polaroid' ? 5 : 2)), g2 = c2.getContext('2d');
      g2.fillStyle = '#fff'; g2.fillRect(0, 0, c2.width, c2.height); g2.drawImage(c, b, b);
      g.restore(); return c2;
    }
    if (e.frame === 'black') { g.strokeStyle = '#111'; g.lineWidth = b; g.strokeRect(b / 2, b / 2, W - b, H - b); }
    if (e.frame === 'gold') { const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#f7e3a1'); gr.addColorStop(.5, '#a87b26'); gr.addColorStop(1, '#f2d27a'); g.strokeStyle = gr; g.lineWidth = b * 1.2; g.strokeRect(b * .6, b * .6, W - b * 1.2, H - b * 1.2); }
    if (e.frame === 'film') { g.fillStyle = '#111'; g.fillRect(0, 0, W, b * 1.6); g.fillRect(0, H - b * 1.6, W, b * 1.6); g.fillStyle = '#eee'; for (let x = b; x < W; x += b * 1.6) { g.fillRect(x, b * .45, b * .7, b * .7); g.fillRect(x, H - b * 1.15, b * .7, b * .7); } }
    if (e.frame === 'rounded') { g.globalCompositeOperation = 'destination-in'; A.render.shapePath(g, 'rounded', W, H); g.fill(); }
    g.restore();
  }
  return c;
};
A.edit.FRAMES = { none: 'ללא', white: 'שוליים לבנים', polaroid: 'פולארויד', black: 'מסגרת שחורה', gold: 'מסגרת זהב', film: 'פס צילום', rounded: 'פינות מעוגלות' };

/* צינור מלא */
A.edit.apply = async function (src, e, photo, opts) {
  opts = opts || {};
  let c = A.edit.geometry(src, e, opts.noCrop);
  const lim = !opts.preview ? (e.effect === 'oil' ? Math.min(e.maxDim || 2400, 2400) : e.maxDim) : 0;
  if (lim && Math.max(c.width, c.height) > lim) {
    const k = lim / Math.max(c.width, c.height);
    const c2 = A.canvas(c.width * k, c.height * k); const g2 = c2.getContext('2d'); g2.imageSmoothingQuality = 'high'; g2.drawImage(c, 0, 0, c2.width, c2.height); c = c2;
  }
  A.edit.pixels(c, e);
  if (!opts.noOverlays) c = await A.edit.overlays(c, e, photo);
  return c;
};

/* שמירת הגרסה הערוכה */
A.edit.save = async function (photo, edits, prog) {
  const origBlob = await A.db.blob(photo.id + ':orig');
  if (!origBlob) throw new Error('קובץ המקור חסר');
  if (prog) prog(0.1, 'טוען את המקור…');
  const src = await A.decode(origBlob, 4096);
  if (prog) prog(0.35, 'מחיל את העריכה ברזולוציה מלאה…');
  await A.sleep(30);
  const out = await A.edit.apply(src, edits, photo);
  if (prog) prog(0.75, 'שומר…');
  const type = edits.frame === 'rounded' ? 'image/png' : 'image/jpeg';
  const full = await A.canvasToBlob(out, type, 0.93);
  const v = await A.photos.makeVariants(full);
  photo.edits = edits; photo.hasEdit = true; photo.editedAt = Date.now();
  photo.ew = out.width; photo.eh = out.height;
  await A.db.tx(['photos', 'blobs'], 'readwrite', ([p, b]) => { p.put(photo); b.put(full, photo.id + ':edit'); b.put(v.dispBlob, photo.id + ':editdisp'); b.put(v.thumbBlob, photo.id + ':editthumb'); });
  A.cache.dropPhoto(photo.id); A.render.forget(photo.id); A.viewer.invalidate();
  await A.touchAlbumsWithPhoto(photo.id);
};
A.edit.revert = async function (photo) {
  photo.edits = null; photo.hasEdit = false;
  await A.db.tx(['photos', 'blobs'], 'readwrite', ([p, b]) => { p.put(photo); ['edit', 'editdisp', 'editthumb'].forEach(k => b.delete(photo.id + ':' + k)); });
  A.cache.dropPhoto(photo.id); A.render.forget(photo.id); A.viewer.invalidate();
  await A.touchAlbumsWithPhoto(photo.id);
};
A.touchAlbumsWithPhoto = async function (id) {
  for (const al of await A.db.albums()) {
    let ch = false;
    al.pages.forEach(p => { if (p.elements.some(e => e.photoId === id) || p.bgPhotoId === id) { p.v = (p.v || 0) + 1; ch = true; } });
    if (ch || al.coverPhotoId === id) await A.db.put('albums', al);
  }
};

/* ================= מסך עורך התמונות ================= */
A.screens.photoEdit = async function (p) {
  const photo = await A.db.photo(p.photoId);
  if (!photo) throw new Error('התמונה לא נמצאה');
  const origBlob = await A.db.blob(photo.id + ':disp');
  const base = await A.decode(origBlob, 1100);
  let e = Object.assign(A.edit.defaults(), JSON.parse(JSON.stringify(photo.edits || {})));
  const hist = [JSON.stringify(e)], fut = [];
  let tab = 'adjust', tool = null, busy = false, dirty = false;

  const s = A.h('div.screen.photoedit');
  s.appendChild(A.h('header.top', null,
    A.h('button.iconbtn', { type: 'button', 'aria-label': 'חזרה', onclick: () => leave() }, '→'),
    A.h('h1', null, 'עריכת תמונה'),
    A.h('div.row.tight', null,
      A.h('button.iconbtn', { type: 'button', 'aria-label': 'ביטול', onclick: () => step(-1) }, '↶'),
      A.h('button.iconbtn', { type: 'button', 'aria-label': 'שחזור', onclick: () => step(1) }, '↷'),
      A.h('button.btn.primary.sm', { type: 'button', onclick: save }, '💾 שמירה'))));
  const cv = A.h('canvas.pe-canvas');
  const ov = A.h('div.pe-ov');
  const stage = A.h('div.pe-stage', null, A.h('div.pe-box', null, cv, ov));
  const compare = A.h('button.chip.compare', { type: 'button' }, '👁️ לחצו והחזיקו להשוואה למקור');
  const tabs = A.h('div.pe-tabs');
  const panel = A.h('div.pe-panel');
  s.append(stage, compare, tabs, panel);
  [['adjust', '🎚️ התאמות'], ['crop', '✂️ חיתוך וסיבוב'], ['filters', '🎨 פילטרים'], ['fix', '🩹 תיקונים'], ['add', '✍️ הוספות']].forEach(([k, l]) =>
    tabs.appendChild(A.h('button.pe-tab', { type: 'button', 'data-k': k, onclick: () => { tab = k; tool = null; renderPanel(); preview(); } }, l)));

  compare.addEventListener('pointerdown', () => { showOrig = true; preview(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => compare.addEventListener(ev, () => { if (showOrig) { showOrig = false; preview(); } }));
  let showOrig = false, pq = false, curDisp = null;

  async function preview() {
    if (pq) return; pq = true;
    requestAnimationFrame(async () => {
      pq = false;
      let c;
      if (showOrig) { c = A.canvas(base.width, base.height); c.getContext('2d').drawImage(base, 0, 0); }
      else c = await A.edit.apply(base, e, photo, { preview: true, noCrop: tab === 'crop' });
      curDisp = c;
      const maxW = Math.min(window.innerWidth - 20, 900), maxH = window.innerHeight * 0.48;
      const k = Math.min(maxW / c.width, maxH / c.height);
      cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0);
      cv.style.width = Math.round(c.width * k) + 'px'; cv.style.height = Math.round(c.height * k) + 'px';
      drawOverlayUI();
    });
  }
  function commit() { hist.push(JSON.stringify(e)); if (hist.length > 80) hist.shift(); fut.length = 0; dirty = true; }
  function step(d) {
    if (d < 0 && hist.length > 1) { fut.push(hist.pop()); e = JSON.parse(hist[hist.length - 1]); }
    else if (d > 0 && fut.length) { hist.push(fut.pop()); e = JSON.parse(hist[hist.length - 1]); }
    else return A.toast('אין פעולה');
    dirty = true; renderPanel(); preview();
  }

  function slider(label, key, min, max, stepv, fmt) {
    const val = A.h('b', null, fmt ? fmt(e[key]) : e[key]);
    const r = A.h('input', { type: 'range', min, max, step: stepv || 1, value: e[key], 'aria-label': label });
    r.addEventListener('input', () => { e[key] = +r.value; val.textContent = fmt ? fmt(e[key]) : e[key]; preview(); });
    r.addEventListener('change', commit);
    r.addEventListener('dblclick', () => { e[key] = 0; r.value = 0; val.textContent = fmt ? fmt(0) : 0; commit(); preview(); });
    return A.h('label.slider', null, A.h('span', null, label, ' ', val), r);
  }
  function chips(map, key, after) {
    return A.h('div.chips', null, Object.entries(map).map(([k, l]) => A.h('button.chip' + (e[key] === k ? '.on' : ''), { type: 'button', onclick: () => { e[key] = k; commit(); renderPanel(); preview(); if (after) after(); } }, l)));
  }
  function renderPanel() {
    A.$$('.pe-tab', tabs).forEach(b => b.classList.toggle('on', b.dataset.k === tab));
    panel.innerHTML = '';
    if (tab === 'adjust') panel.append(
      A.h('button.btn.primary', { type: 'button', onclick: () => { e.auto = !e.auto; commit(); renderPanel(); preview(); } }, e.auto ? '✨ שיפור אוטומטי: פעיל' : '✨ שיפור אוטומטי'),
      slider('חשיפה', 'exposure', -2, 2, 0.05, v => (v > 0 ? '+' : '') + (+v).toFixed(2)),
      slider('בהירות', 'brightness', -100, 100), slider('ניגודיות', 'contrast', -100, 100), slider('רוויה', 'saturation', -100, 100),
      slider('טמפרטורת צבע', 'temperature', -100, 100), slider('חדות', 'sharpness', -50, 100), slider('הבהרת צללים', 'shadows', 0, 100),
      slider('הסרת רעשים', 'denoise', 0, 100), slider('הכהיית שוליים', 'vignette', 0, 100),
      A.h('p.muted', null, 'טיפ: לחיצה כפולה על מחוון מאפסת אותו.'));
    if (tab === 'crop') {
      const asp = [['free', 'חופשי'], [1, '1:1'], [4 / 3, '4:3'], [3 / 4, '3:4'], [3 / 2, '3:2'], [16 / 9, '16:9']];
      panel.append(
        A.h('div.row.wrap', null,
          A.h('button.btn', { type: 'button', onclick: () => { e.rot90 = (e.rot90 + 3) % 4; e.crop = null; commit(); preview(); } }, '⟲ 90°'),
          A.h('button.btn', { type: 'button', onclick: () => { e.rot90 = (e.rot90 + 1) % 4; e.crop = null; commit(); preview(); } }, '⟳ 90°'),
          A.h('button.btn', { type: 'button', onclick: () => { e.flipH = !e.flipH; commit(); preview(); } }, '⇋ היפוך'),
          A.h('button.btn', { type: 'button', onclick: () => { e.crop = null; commit(); preview(); } }, '↺ ביטול חיתוך')),
        slider('יישור (מעלות)', 'straighten', -15, 15, 0.5),
        A.h('div.chips', null, asp.map(([v, l]) => A.h('button.chip', { type: 'button', onclick: () => setAspect(v) }, l))),
        A.h('label.field', null, A.h('span', null, 'שינוי גודל בשמירה'), A.h('select.inp', { onchange: ev => { e.maxDim = +ev.target.value; commit(); } },
          [[0, 'גודל מקורי'], [4000, 'עד 4000 פיקסלים'], [3000, 'עד 3000'], [2048, 'עד 2048'], [1600, 'עד 1600'], [1024, 'עד 1024 (לשיתוף)']].map(([v, l]) => A.h('option', { value: v, selected: e.maxDim === v }, l)))),
        A.h('p.muted', null, 'גררו את פינות המסגרת על התמונה כדי לחתוך.'));
      if (!e.crop) e.crop = { x: 0, y: 0, w: 1, h: 1 };
    }
    if (tab === 'filters') panel.append(A.h('h3', null, 'פילטרים מקצועיים'), chips(A.edit.FILTERS, 'filter'), A.h('h3', null, 'אפקטים אומנותיים'), chips(A.edit.EFFECTS, 'effect'), A.h('p.muted', null, 'אפקט "ציור שמן" כבד יותר ועשוי לקחת כמה שניות בשמירה.'));
    if (tab === 'fix') panel.append(
      A.h('div.grid2', null,
        A.h('button.btn', { type: 'button', onclick: () => { e.fade = !e.fade; commit(); renderPanel(); preview(); } }, (e.fade ? '✅ ' : '') + '🎞️ שחזור צבעים דהויים'),
        A.h('button.btn', { type: 'button', onclick: () => { e.shadows = 60; e.exposure = Math.max(e.exposure, 0.35); e.denoise = Math.max(e.denoise, 25); commit(); renderPanel(); preview(); } }, '🌙 שיפור תמונה חשוכה'),
        A.h('button.btn', { type: 'button', onclick: () => { e.sharpness = 75; e.denoise = Math.max(e.denoise, 15); commit(); renderPanel(); preview(); } }, '🔍 שיפור מטושטשת (במידת האפשר)'),
        A.h('button.btn', { type: 'button', onclick: () => { e.auto = true; e.fade = true; e.denoise = 35; e.sharpness = 35; commit(); renderPanel(); preview(); } }, '🖼️ תיקון תמונה ישנה'),
        A.h('button.btn', { type: 'button', onclick: () => { e.denoise = 55; commit(); renderPanel(); preview(); } }, '🔇 הסרת רעשים חזקה'),
        A.h('button.btn', { type: 'button', onclick: () => { e.auto = true; e.sharpness = Math.max(e.sharpness, 25); e.denoise = Math.max(e.denoise, 15); commit(); renderPanel(); preview(); } }, '⬆️ שיפור איכות')),
      A.h('div.row.wrap', null,
        A.h('button.btn' + (tool === 'redeye' ? '.primary' : ''), { type: 'button', onclick: () => { tool = tool === 'redeye' ? null : 'redeye'; renderPanel(); if (tool) A.toast('הקישו על כל עין אדומה בתמונה'); } }, '👁️ תיקון עיניים אדומות'),
        A.h('button.btn' + (tool === 'heal' ? '.primary' : ''), { type: 'button', onclick: () => { tool = tool === 'heal' ? null : 'heal'; renderPanel(); if (tool) A.toast('העבירו את האצבע על הפגם או האובייקט הקטן'); } }, '🩹 מחיקת פגם / אובייקט קטן')),
      tool === 'heal' ? A.h('label.slider', null, A.h('span', null, 'גודל המברשת'), A.h('input', { type: 'range', min: 0.005, max: 0.06, step: 0.001, value: brush, oninput: ev => { brush = +ev.target.value; } })) : null,
      A.h('button.btn', { type: 'button', onclick: () => { e.redeye = []; e.heal = []; commit(); preview(); } }, '↺ ביטול כל התיקונים הנקודתיים'),
      A.h('div.note', null, '🕓 בתוכנית הפיתוח (דורש בינה מלאכותית ואינו פעיל עדיין): הסרת רקע, טשטוש רקע אוטומטי, צביעת תמונות שחור־לבן, מחיקת אובייקטים גדולים.'));
    if (tab === 'add') {
      panel.append(
        A.h('h3', null, 'מסגרת לתמונה'), chips(A.edit.FRAMES, 'frame'),
        A.h('div.row.wrap', null,
          A.h('button.btn', { type: 'button', onclick: addText }, '🔤 טקסט'),
          A.h('button.btn', { type: 'button', onclick: addSticker }, '😊 מדבקה'),
          A.h('button.btn', { type: 'button', onclick: () => { e.overlays.push({ id: A.uid(), type: 'date', x: 0.84, y: 0.92, size: 0.05 }); commit(); renderPanel(); preview(); } }, '📅 תאריך'),
          A.h('button.btn', { type: 'button', onclick: addSignature }, '🖋️ חתימה אישית')),
        (e.overlays || []).length ? A.h('p.muted', null, 'גררו כל תוספת על התמונה למיקום הרצוי.') : null);
      (e.overlays || []).forEach(o => panel.appendChild(A.h('div.ov-row', null,
        A.h('span', null, o.type === 'text' ? '🔤 ' + o.text : o.type === 'date' ? '📅 תאריך' : o.type === 'sticker' ? o.emoji : '🖋️ חתימה'),
        A.h('input', { type: 'range', min: 0.02, max: 0.25, step: 0.005, value: o.size, 'aria-label': 'גודל', oninput: ev => { o.size = +ev.target.value; preview(); }, onchange: commit }),
        o.type === 'text' ? A.h('input', { type: 'color', value: o.color || '#ffffff', 'aria-label': 'צבע', oninput: ev => { o.color = ev.target.value; preview(); }, onchange: commit }) : null,
        A.h('button.iconbtn', { type: 'button', 'aria-label': 'הסרה', onclick: () => { e.overlays = e.overlays.filter(x => x !== o); commit(); renderPanel(); preview(); } }, '✕'))));
    }
    panel.appendChild(A.h('div.row.wrap.endrow', null,
      photo.hasEdit ? A.h('button.btn.danger', { type: 'button', onclick: async () => { if (await A.confirm('חזרה למקור', 'לבטל את כל העריכות ולחזור לתמונה המקורית?', 'חזרה למקור', true)) { await A.edit.revert(photo); A.toast('התמונה חזרה למקור'); A.router.back(); } } }, '↩️ חזרה למקור') : null,
      A.h('button.btn', { type: 'button', onclick: async () => { const b = await A.db.blob(photo.id + (photo.hasEdit ? ':edit' : ':orig')); if (b) await A.saveFile(b, A.safeName(photo.name.replace(/\.\w+$/, '')) + (photo.hasEdit ? '_ערוך' : '') + '.jpg', 'save'); A.toast('נשמר בתיקיית ההורדות'); } }, '📥 שמירה למכשיר')));
  }
  let brush = 0.02;

  async function addText() { const t = await A.prompt('טקסט על התמונה', 'הטקסט', ''); if (!t) return; e.overlays.push({ id: A.uid(), type: 'text', text: t, x: 0.5, y: 0.85, size: 0.07, color: '#ffffff', font: 'sans', bold: true }); commit(); renderPanel(); preview(); }
  function addSticker() {
    const grid = A.h('div.emoji-grid'); let close;
    A.render.STICKERS.forEach(em => grid.appendChild(A.h('button.emoji', { type: 'button', onclick: () => { close(); e.overlays.push({ id: A.uid(), type: 'sticker', emoji: em, x: 0.5, y: 0.5, size: 0.14 }); commit(); renderPanel(); preview(); } }, em)));
    A.modal('מדבקות', grid, [{ label: 'סגירה', value: null }], { onOpen: (c, cl) => { close = cl; } });
  }
  async function addSignature() {
    const sigs = (await A.db.photos()).filter(x => x.kind === 'signature');
    let id = null;
    if (sigs.length) {
      const ch = await A.modal('חתימה אישית', A.h('p', null, 'להשתמש בחתימה שמורה או לחתום מחדש?'), [{ label: 'ביטול', value: null }, { label: '✍️ חתימה חדשה', value: 'new' }, { label: 'החתימה השמורה', value: 'old', cls: 'primary' }]);
      if (!ch) return;
      if (ch === 'old') id = sigs[sigs.length - 1].id;
    }
    if (!id) { const rec = await A.signaturePad(); if (!rec) return; id = rec.id; }
    e.overlays.push({ id: A.uid(), type: 'signature', photoId: id, x: 0.2, y: 0.88, size: 0.08 });
    commit(); renderPanel(); preview();
  }

  /* ----- שכבת אינטראקציה על התצוגה ----- */
  function setAspect(v) {
    const W = curDisp.width, H = curDisp.height;
    if (v === 'free') { e.crop = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }; }
    else {
      let w = 1, h = (W / v) / H;
      if (h > 1) { h = 1; w = (H * v) / W; }
      e.crop = { x: (1 - w) / 2, y: (1 - h) / 2, w, h, asp: v };
    }
    commit(); drawOverlayUI();
  }
  function drawOverlayUI() {
    ov.innerHTML = '';
    ov.style.width = cv.style.width; ov.style.height = cv.style.height;
    if (tab === 'crop' && e.crop && !showOrig) {
      const b = A.h('div.cropbox');
      b.style.left = e.crop.x * 100 + '%'; b.style.top = e.crop.y * 100 + '%'; b.style.width = e.crop.w * 100 + '%'; b.style.height = e.crop.h * 100 + '%';
      ['nw', 'ne', 'sw', 'se'].forEach(k => b.appendChild(A.h('div.hdl.' + k, { 'data-h': k })));
      ov.appendChild(b);
    }
    if (tab === 'add') (e.overlays || []).forEach(o => { const d = A.h('div.ov-dot'); d.style.left = o.x * 100 + '%'; d.style.top = o.y * 100 + '%'; ov.appendChild(d); });
  }
  let drag = null;
  ov.addEventListener('pointerdown', ev => {
    ov.setPointerCapture(ev.pointerId);
    const r = ov.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    if (tab === 'crop' && e.crop) {
      const h = ev.target.dataset && ev.target.dataset.h;
      drag = { kind: h ? 'h' : 'move', h, x0: x, y0: y, c0: Object.assign({}, e.crop) };
    } else if (tab === 'fix' && tool === 'redeye') {
      e.redeye.push({ x, y, r: 0.025 }); commit(); preview();
    } else if (tab === 'fix' && tool === 'heal') {
      drag = { kind: 'heal' }; e.heal.push({ x, y, r: brush }); preview();
    } else if (tab === 'add') {
      let best = null, bd = 0.08;
      (e.overlays || []).forEach(o => { const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; } });
      if (best) drag = { kind: 'ov', o: best };
    }
  });
  ov.addEventListener('pointermove', ev => {
    if (!drag) return;
    const r = ov.getBoundingClientRect();
    const x = A.clamp((ev.clientX - r.left) / r.width, 0, 1), y = A.clamp((ev.clientY - r.top) / r.height, 0, 1);
    if (drag.kind === 'move') {
      const c = e.crop, c0 = drag.c0;
      c.x = A.clamp(c0.x + x - drag.x0, 0, 1 - c.w); c.y = A.clamp(c0.y + y - drag.y0, 0, 1 - c.h); drawOverlayUI();
    } else if (drag.kind === 'h') {
      const c0 = drag.c0, c = e.crop;
      let x1 = c0.x, y1 = c0.y, x2 = c0.x + c0.w, y2 = c0.y + c0.h;
      if (drag.h.includes('w')) x1 = Math.min(x, x2 - 0.05); else x2 = Math.max(x, x1 + 0.05);
      if (drag.h.includes('n')) y1 = Math.min(y, y2 - 0.05); else y2 = Math.max(y, y1 + 0.05);
      if (c0.asp) {
        const W = curDisp.width, H = curDisp.height;
        const w = x2 - x1, hh = (w * W / c0.asp) / H;
        if (drag.h.includes('n')) y1 = y2 - hh; else y2 = y1 + hh;
        if (y1 < 0 || y2 > 1) return;
      }
      Object.assign(c, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, asp: c0.asp }); drawOverlayUI();
    } else if (drag.kind === 'heal') {
      const last = e.heal[e.heal.length - 1];
      if (Math.hypot(last.x - x, last.y - y) > brush * 0.6) { e.heal.push({ x, y, r: brush }); preview(); }
    } else if (drag.kind === 'ov') { drag.o.x = x; drag.o.y = y; preview(); }
  });
  const end = () => { if (drag) { commit(); drag = null; preview(); } };
  ov.addEventListener('pointerup', end); ov.addEventListener('pointercancel', end);

  async function save() {
    if (busy) return; busy = true;
    const pr = A.progress('שומר גרסה ערוכה (המקור נשמר)…');
    try {
      if (e.crop && e.crop.x === 0 && e.crop.y === 0 && e.crop.w === 1 && e.crop.h === 1) e.crop = null;
      await A.edit.save(photo, e, (f, m) => pr.set(f, m));
      dirty = false;
      pr.done();
      A.toast('✅ נשמר. אפשר תמיד לחזור למקור.');
      A.router.back();
    } catch (err) { pr.done(); A.alert('השמירה נכשלה', err.message); }
    finally { busy = false; }
  }
  async function leave() {
    if (dirty && !(await A.confirm('לצאת בלי לשמור?', 'השינויים שלא נשמרו יאבדו.', 'יציאה', true))) return;
    dirty = false;
    A.router.back();
  }
  renderPanel();
  preview();
  return s;
};

/* לוח חתימה באצבע */
A.signaturePad = async function () {
  const c = A.h('canvas.sigpad', { width: 900, height: 360 });
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1a2a6c'; g.lineWidth = 7;
  let drawing = false, last = null, any = false;
  const pos = ev => { const r = c.getBoundingClientRect(); return { x: (ev.clientX - r.left) * c.width / r.width, y: (ev.clientY - r.top) * c.height / r.height }; };
  c.addEventListener('pointerdown', ev => { c.setPointerCapture(ev.pointerId); drawing = true; last = pos(ev); });
  c.addEventListener('pointermove', ev => { if (!drawing) return; const p = pos(ev); g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; any = true; });
  c.addEventListener('pointerup', () => { drawing = false; });
  const color = A.h('input', { type: 'color', value: '#1a2a6c', oninput: ev => { g.strokeStyle = ev.target.value; }, 'aria-label': 'צבע' });
  const r = await A.modal('🖋️ חתמו באצבע', A.h('div', null, c, A.h('div.row', null, color, A.h('button.btn', { type: 'button', onclick: () => { g.clearRect(0, 0, c.width, c.height); any = false; } }, 'ניקוי'))),
    [{ label: 'ביטול', value: null }, { label: 'שמירת החתימה', value: 'ok', cls: 'primary' }], { sticky: true });
  if (r !== 'ok' || !any) return null;
  const b = await A.canvasToBlob(c, 'image/png');
  return A.photos.addGenerated(b, 'חתימה.png', 'signature');
};
