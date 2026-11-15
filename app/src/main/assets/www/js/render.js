/* האלבום שלי — מנוע ציור עמודים וכריכות (Canvas) */
'use strict';
A.render = {};

/* ---------- טקסטורות ---------- */
const texCache = {};
function noiseTex(key, base, amt, size, fn) {
  if (texCache[key]) return texCache[key];
  const c = A.canvas(size || 256, size || 256), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4;
    const n = fn ? fn(x, y) : (Math.random() - 0.5) * amt;
    d[i] = A.clamp(d[i] + n, 0, 255); d[i + 1] = A.clamp(d[i + 1] + n, 0, 255); d[i + 2] = A.clamp(d[i + 2] + n, 0, 255);
  }
  g.putImageData(im, 0, 0);
  return (texCache[key] = c);
}
A.render.paperTex = color => noiseTex('paper' + color, color, 10, 256);
A.render.coverTex = function (type, color) {
  const key = 'cov' + type + color;
  if (texCache[key]) return texCache[key];
  if (type === 'leather') {
    const s = 256, c = noiseTex(key + 'n', color, 0, s, () => 0), g = c.getContext('2d');
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 1 + Math.random() * 3.5;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.05)';
      g.beginPath(); g.ellipse(x, y, r, r * (0.6 + Math.random() * 0.6), Math.random() * 3, 0, 7); g.fill();
    }
    return (texCache[key] = c);
  }
  if (type === 'fabric') return (texCache[key] = noiseTex(key, color, 0, 128, (x, y) => ((x % 4 < 2) !== (y % 4 < 2) ? 14 : -10) + (Math.random() - 0.5) * 10));
  if (type === 'wood') {
    const ph = Math.random() * 10;
    return (texCache[key] = noiseTex(key, color, 0, 256, (x, y) => Math.sin((y + Math.sin(x / 37 + ph) * 9) / 3.2) * 13 + Math.sin(y / 17) * 8 + (Math.random() - 0.5) * 6));
  }
  return (texCache[key] = noiseTex(key, color, 18, 256));
};

/* ---------- מדבקות ואיורים וקטוריים ---------- */
A.render.ILLUS = {
  heart: ['לב', '<path d="M50 88C20 66 6 50 6 32 6 18 17 8 30 8c9 0 16 5 20 12 4-7 11-12 20-12 13 0 24 10 24 24 0 18-14 34-44 56z" fill="#d6455d"/>'],
  hearts: ['לבבות', '<path d="M30 60C14 48 6 40 6 30 6 22 12 16 19 16c5 0 9 3 11 7 2-4 6-7 11-7 7 0 13 6 13 14 0 10-8 18-24 30z" fill="#e2687d"/><path d="M70 90C56 80 50 73 50 64c0-7 5-12 11-12 4 0 7 2 9 6 2-4 5-6 9-6 6 0 11 5 11 12 0 9-6 16-20 26z" fill="#c23a54"/>'],
  star: ['כוכב', '<path d="M50 6l12 30 32 2-25 20 9 32-28-18-28 18 9-32L6 38l32-2z" fill="#f2c14e" stroke="#c9922a" stroke-width="2"/>'],
  david: ['מגן דוד', '<g fill="none" stroke="#2a5aa8" stroke-width="6"><path d="M50 8L88 72H12z"/><path d="M50 92L12 28h76z"/></g>'],
  flower: ['פרח', '<g transform="translate(50 50)"><g fill="#f4a6b8">' + [0, 60, 120, 180, 240, 300].map(a => '<ellipse rx="13" ry="24" cy="-22" transform="rotate(' + a + ')"/>').join('') + '</g><circle r="12" fill="#f6c945"/></g>'],
  leaf: ['ענף', '<path d="M10 90C30 60 60 30 90 10" stroke="#4f7d3a" stroke-width="4" fill="none"/>' + [[30, 66, -30], [45, 50, -30], [60, 36, -30], [36, 58, 60], [52, 42, 60], [68, 28, 60]].map(p => '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="11" ry="5" transform="rotate(' + p[2] + ' ' + p[0] + ' ' + p[1] + ')" fill="#6fa35a"/>').join('')],
  balloons: ['בלונים', '<path d="M30 52q-2 20 8 44M62 46q4 24-4 50M48 58q0 18 0 38" stroke="#777" stroke-width="1.5" fill="none"/><ellipse cx="30" cy="30" rx="16" ry="20" fill="#e85a6a"/><ellipse cx="62" cy="26" rx="16" ry="20" fill="#4c8fd6"/><ellipse cx="48" cy="40" rx="15" ry="19" fill="#f2c14e"/>'],
  ring: ['טבעות', '<g fill="none" stroke="#d4a937" stroke-width="7"><circle cx="38" cy="58" r="22"/><circle cx="62" cy="58" r="22"/></g><path d="M56 30l6-12 6 12-6 6z" fill="#bfe6ff" stroke="#8ab" />'],
  cake: ['עוגה', '<rect x="18" y="52" width="64" height="36" rx="6" fill="#f3c6d3"/><rect x="18" y="62" width="64" height="8" fill="#e58aa5"/><rect x="47" y="30" width="6" height="22" fill="#7cb7e8"/><path d="M50 18q6 6 0 12q-6-6 0-12z" fill="#f6a623"/>'],
  camera: ['מצלמה', '<rect x="10" y="30" width="80" height="54" rx="9" fill="#3a3f47"/><rect x="34" y="20" width="32" height="14" rx="4" fill="#3a3f47"/><circle cx="50" cy="57" r="18" fill="#9fb5c9" stroke="#e8edf2" stroke-width="5"/><circle cx="76" cy="40" r="4" fill="#f2c14e"/>'],
  plane: ['מטוס', '<path d="M8 56l84-30-20 52-18-14-10 18-4-24z" fill="#4c8fd6"/><path d="M50 62L92 26 40 58z" fill="#2f6aa8"/>'],
  sun: ['שמש', '<g stroke="#f2a93b" stroke-width="5">' + [0, 45, 90, 135, 180, 225, 270, 315].map(a => '<line x1="50" y1="8" x2="50" y2="20" transform="rotate(' + a + ' 50 50)"/>').join('') + '</g><circle cx="50" cy="50" r="22" fill="#f6c945"/>'],
  candles: ['נרות שבת', '<rect x="26" y="40" width="12" height="46" fill="#f6f1e3" stroke="#bbb"/><rect x="62" y="40" width="12" height="46" fill="#f6f1e3" stroke="#bbb"/><path d="M32 22q7 8 0 16q-7-8 0-16zM68 22q7 8 0 16q-7-8 0-16z" fill="#f6a623"/><rect x="18" y="84" width="64" height="6" rx="3" fill="#b9a26b"/>'],
  ribbon: ['סרט', '<path d="M50 50L14 30v40zM50 50l36-20v40z" fill="#c23a54"/><circle cx="50" cy="50" r="9" fill="#a32a44"/><path d="M44 56l-10 34 12-8 4 12 4-38z" fill="#c23a54"/>'],
  corner: ['פינה מעוטרת', '<path d="M6 94V40C6 20 20 6 40 6h54" fill="none" stroke="#b08a3e" stroke-width="4"/><path d="M16 94V46c0-16 14-30 30-30h48" fill="none" stroke="#b08a3e" stroke-width="2"/><circle cx="22" cy="22" r="6" fill="#b08a3e"/>'],
  banner: ['כרזה', '<path d="M4 30h92l-10 18 10 18H4l10-18z" fill="#2f6a8a"/><path d="M14 36h72v24H14z" fill="#3c84ab"/>'],
  baby: ['רגליים קטנות', '<g fill="#e9a3b4"><ellipse cx="34" cy="60" rx="12" ry="20"/><ellipse cx="66" cy="54" rx="12" ry="20"/><circle cx="26" cy="34" r="4"/><circle cx="33" cy="30" r="4"/><circle cx="41" cy="31" r="3.5"/><circle cx="58" cy="25" r="3.5"/><circle cx="66" cy="23" r="4"/><circle cx="74" cy="27" r="4"/></g>'],
  pomegranate: ['רימון', '<circle cx="50" cy="56" r="32" fill="#c0303f"/><path d="M40 26l4-12 6 8 6-8 4 12z" fill="#9c2230"/><ellipse cx="40" cy="48" rx="8" ry="5" fill="#e06070" opacity=".6"/>']
};
A.render.STICKERS = ['❤️', '💕', '⭐', '✨', '🎉', '🎂', '🎈', '🎁', '💍', '👰', '🤵', '👶', '🍼', '🌸', '🌻', '🌿', '🍃', '☀️', '🌙', '🌊', '🏖️', '✈️', '🚗', '🏔️', '📷', '🎓', '🕎', '✡️', '🍷', '🍯', '🍎', '🐶', '🐱', '⚽', '🎵', '👨‍👩‍👧‍👦', '😊', '😍', '🥳', '🙏', '👑', '🌈', '🦋', '🕯️', '📜', '🖋️'];
const illusImg = {};
A.render.preloadIllus = () => Promise.all(Object.keys(A.render.ILLUS).map(k => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">' + A.render.ILLUS[k][1] + '</svg>';
  return A.loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)).then(im => { illusImg[k] = im; }).catch(() => {});
}));
A.render.illusUrl = k => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + (A.render.ILLUS[k] || ['', ''])[1] + '</svg>');

/* ---------- צורות ומסגרות ---------- */
A.render.SHAPES = { rect: 'מלבן', rounded: 'פינות מעוגלות', circle: 'עיגול', heart: 'לב', star: 'כוכב', hex: 'משושה', arch: 'קשת' };
A.render.FRAMES = { none: 'ללא', white: 'שוליים לבנים', polaroid: 'פולארויד', thin: 'קו דק', gold: 'זהב', wood: 'עץ', shadow: 'צל בלבד', corners: 'פינות אלבום', tape: 'נייר דבק', vintage: 'וינטג׳' };
A.render.FONTS = { sans: ['רגיל', '"Noto Sans Hebrew", "Rubik", Arial, sans-serif'], serif: ['קלאסי', '"Noto Serif Hebrew", "David", "Frank Ruehl", serif'], script: ['כתב יד', '"Dancing Script", "Guttman Yad-Brush", cursive'], mono: ['מכונת כתיבה', '"Courier New", monospace'] };

function shapePath(g, shape, w, h) {
  g.beginPath();
  if (shape === 'circle') { g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); }
  else if (shape === 'rounded') { const r = Math.min(w, h) * 0.08; g.roundRect ? g.roundRect(0, 0, w, h, r) : g.rect(0, 0, w, h); }
  else if (shape === 'heart') {
    g.moveTo(w / 2, h * 0.95);
    g.bezierCurveTo(w * -0.15, h * 0.6, w * 0.02, h * -0.05, w / 2, h * 0.22);
    g.bezierCurveTo(w * 0.98, h * -0.05, w * 1.15, h * 0.6, w / 2, h * 0.95);
  } else if (shape === 'star') {
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.42 : 1, a = -Math.PI / 2 + i * Math.PI / 5; const x = w / 2 + Math.cos(a) * w / 2 * r, y = h / 2 + Math.sin(a) * h / 2 * r * 1.05 + h * 0.03; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath();
  } else if (shape === 'hex') {
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; const x = w / 2 + Math.cos(a) * w / 2, y = h / 2 + Math.sin(a) * h / 2; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath();
  } else if (shape === 'arch') {
    g.moveTo(0, h); g.lineTo(0, w / 2); g.arc(w / 2, Math.min(w / 2, h), w / 2, Math.PI, 0); g.lineTo(w, h); g.closePath();
  } else g.rect(0, 0, w, h);
}
A.render.shapePath = shapePath;

/* ציור תמונה בתוך מסגרת עם חיתוך, זום והזזה */
A.render.drawCover = function (g, img, bw, bh, el) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const half = el && el.half;
  const srcW = half ? iw / 2 : iw, srcH = ih, sx0 = half === 'R' ? iw / 2 : 0;
  const zoom = Math.max(1, (el && el.zoom) || 1);
  const s = Math.max(bw / srcW, bh / srcH) * zoom;
  const vw = bw / s, vh = bh / s;
  const ox = el && el.ox != null ? el.ox : 0, oy = el && el.oy != null ? el.oy : 0;
  const sx = sx0 + (srcW - vw) * (ox + 1) / 2, sy = (srcH - vh) * (oy + 1) / 2;
  g.drawImage(img, sx, sy, vw, vh, 0, 0, bw, bh);
};

/* ---------- טעינת תמונות לציור (עם מטמון זיכרון קטן) ---------- */
const imgMem = new Map();
A.render.getImg = async function (photoId, size) {
  const key = photoId + '|' + size;
  if (imgMem.has(key)) { const v = imgMem.get(key); imgMem.delete(key); imgMem.set(key, v); return v; }
  const p = await A.db.photo(photoId);
  if (!p) return null;
  const url = await A.cache.photoUrl(p, size);
  if (!url) return null;
  let im;
  try { im = await A.loadImage(url); } catch (e) { return null; }
  imgMem.set(key, im);
  while (imgMem.size > 60) imgMem.delete(imgMem.keys().next().value);
  return im;
};
A.render.forget = photoId => { for (const k of Array.from(imgMem.keys())) if (k.startsWith(photoId + '|')) imgMem.delete(k); };
A.render.getPoster = async function (mediaId) {
  const key = 'm:' + mediaId;
  if (imgMem.has(key)) return imgMem.get(key);
  const u = await A.cache.url(mediaId + ':poster');
  if (!u) return null;
  try { const im = await A.loadImage(u); imgMem.set(key, im); return im; } catch (e) { return null; }
};

/* עיטוף שורות טקסט */
function wrapLines(g, text, maxW) {
  const out = [];
  String(text || '').split('\n').forEach(par => {
    const words = par.split(/\s+/);
    let line = '';
    words.forEach(w => {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    });
    out.push(line);
  });
  return out;
}

function drawFrameUnder(g, el, w, h, S) {
  const f = el.frame || 'none';
  if (f === 'none' || f === 'tape' || f === 'corners') { if (f !== 'none') { g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = S * 0.012; g.shadowOffsetY = S * 0.004; g.fillStyle = 'rgba(0,0,0,0.01)'; shapePath(g, el.shape, w, h); g.fill(); g.shadowColor = 'transparent'; } return { l: 0, t: 0, r: 0, b: 0 }; }
  const p = S * 0.018;
  let ins = { l: p, t: p, r: p, b: p };
  if (f === 'polaroid') ins = { l: p, t: p, r: p, b: p * 4.2 };
  if (f === 'thin') ins = { l: S * 0.004, t: S * 0.004, r: S * 0.004, b: S * 0.004 };
  if (f === 'shadow') ins = { l: 0, t: 0, r: 0, b: 0 };
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.32)'; g.shadowBlur = S * 0.018; g.shadowOffsetY = S * 0.006;
  if (f === 'gold') { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#f7e3a1'); gr.addColorStop(0.5, '#b8892e'); gr.addColorStop(1, '#f2d27a'); g.fillStyle = gr; }
  else if (f === 'wood') g.fillStyle = g.createPattern(A.render.coverTex('wood', '#8a5a33'), 'repeat');
  else if (f === 'thin') g.fillStyle = '#222';
  else if (f === 'vintage') g.fillStyle = '#efe6cf';
  else if (f === 'shadow') g.fillStyle = '#000';
  else g.fillStyle = '#ffffff';
  shapePath(g, el.shape === 'rect' || !el.shape ? 'rect' : el.shape, w, h);
  g.fill();
  g.restore();
  if (f === 'vintage') { g.strokeStyle = 'rgba(120,90,40,0.5)'; g.lineWidth = S * 0.002; g.setLineDash([S * 0.006, S * 0.004]); g.strokeRect(p * 0.45, p * 0.45, w - p * 0.9, h - p * 0.9); g.setLineDash([]); }
  return ins;
}
function drawFrameOver(g, el, w, h, S) {
  const f = el.frame;
  if (f === 'corners') {
    const c = Math.min(w, h) * 0.16;
    g.fillStyle = '#1d1d1d';
    [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]].forEach(([x, y, sx, sy]) => {
      g.beginPath(); g.moveTo(x - sx * c * 0.12, y - sy * c * 0.12); g.lineTo(x + sx * c, y - sy * c * 0.12); g.lineTo(x - sx * c * 0.12, y + sy * c); g.closePath(); g.fill();
    });
  } else if (f === 'tape') {
    g.fillStyle = 'rgba(240,228,190,0.82)';
    [[w * 0.1, -S * 0.006, -0.6], [w * 0.9, -S * 0.006, 0.6]].forEach(([x, y, r]) => { g.save(); g.translate(x, y); g.rotate(r); g.fillRect(-S * 0.045, -S * 0.012, S * 0.09, S * 0.026); g.restore(); });
  }
}

/* ציור אלמנט בודד; S = רוחב העמוד בפיקסלים */
A.render.drawElement = async function (g, el, S, H, opt) {
  const x = el.x * S, y = el.y * H, w = el.w * S, h = el.h * H;
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.rotate((el.rot || 0) * Math.PI / 180);
  g.translate(-w / 2, -h / 2);
  if (el.opacity != null) g.globalAlpha = el.opacity;
  if (el.type === 'photo' || el.type === 'video') {
    const ins = drawFrameUnder(g, el, w, h, S);
    const iw = w - ins.l - ins.r, ih = h - ins.t - ins.b;
    g.save();
    g.translate(ins.l, ins.t);
    shapePath(g, el.shape, iw, ih);
    g.clip();
    let img = null;
    if (el.type === 'photo' && el.photoId) img = await A.render.getImg(el.photoId, opt.size || 'disp');
    if (el.type === 'video' && el.mediaId) img = await A.render.getPoster(el.mediaId);
    if (img) A.render.drawCover(g, img, iw, ih, el);
    else { g.fillStyle = opt.editing ? '#d9d4ca' : 'rgba(0,0,0,0.06)'; g.fillRect(0, 0, iw, ih); if (opt.editing) { g.fillStyle = '#8b8478'; g.font = (Math.min(iw, ih) * 0.22) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('＋', iw / 2, ih / 2); } }
    if (opt.finish === 'glossy' && img) { const gr = g.createLinearGradient(0, 0, iw, ih); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, iw, ih); }
    if (el.type === 'video') {
      const r = Math.min(iw, ih) * 0.14;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(iw / 2, ih / 2, r, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(iw / 2 - r * 0.35, ih / 2 - r * 0.5); g.lineTo(iw / 2 - r * 0.35, ih / 2 + r * 0.5); g.lineTo(iw / 2 + r * 0.55, ih / 2); g.closePath(); g.fill();
    }
    g.restore();
    drawFrameOver(g, el, w, h, S);
    if (el.frame === 'polaroid' && el.caption) {
      g.fillStyle = '#333'; g.font = (S * 0.03) + 'px ' + A.render.FONTS.script[1]; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
      g.fillText(el.caption, w / 2, h - ins.b / 2, w * 0.9);
    }
  } else if (el.type === 'text') {
    const fs = (el.size || 0.05) * S;
    g.font = (el.bold ? 'bold ' : '') + (el.italic ? 'italic ' : '') + fs + 'px ' + (A.render.FONTS[el.font] || A.render.FONTS.sans)[1];
    g.direction = 'rtl'; g.textBaseline = 'middle';
    if (el.bg) { g.fillStyle = el.bg; g.fillRect(0, 0, w, h); }
    const lines = wrapLines(g, el.text, w * 0.96);
    const lh = fs * 1.25, total = lines.length * lh;
    const al = el.align || 'center';
    g.textAlign = al === 'center' ? 'center' : al === 'left' ? 'left' : 'right';
    const tx = al === 'center' ? w / 2 : al === 'left' ? w * 0.02 : w * 0.98;
    lines.forEach((ln, i) => {
      const ty = h / 2 - total / 2 + lh * (i + 0.5);
      if (el.shadow) { g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = fs * 0.15; g.shadowOffsetY = fs * 0.05; }
      if (el.stroke) { g.lineWidth = fs * 0.08; g.strokeStyle = el.stroke; g.strokeText(ln, tx, ty); }
      g.fillStyle = el.color || '#222'; g.fillText(ln, tx, ty);
      g.shadowColor = 'transparent';
    });
  } else if (el.type === 'sticker') {
    if (el.illus && illusImg[el.illus]) g.drawImage(illusImg[el.illus], 0, 0, w, h);
    else { g.font = Math.min(w, h) * 0.86 + 'px "Noto Color Emoji", "Apple Color Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(el.emoji || '⭐', w / 2, h / 2 + h * 0.04); }
  } else if (el.type === 'audio') {
    g.fillStyle = 'rgba(255,255,255,0.88)'; g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = S * 0.002;
    shapePath(g, 'rounded', w, h); g.fill(); g.stroke();
    const r = Math.min(w, h) * 0.32;
    g.fillStyle = '#b5523b'; g.beginPath(); g.arc(h / 2, h / 2, r, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = r * 1.1 + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🔊', h / 2, h / 2 + r * 0.05);
    g.fillStyle = '#333'; g.font = Math.min(h * 0.28, w * 0.07) + 'px sans-serif'; g.direction = 'rtl'; g.textAlign = 'right';
    g.fillText(el.caption || 'הקשיבו להקלטה', w - h * 0.2, h / 2, w - h * 1.3);
  } else if (el.type === 'shape') {
    g.fillStyle = el.color || '#c9a96e'; shapePath(g, el.shape || 'rect', w, h); g.fill();
  }
  g.restore();
};

/* ציור עמוד מלא ל-canvas */
A.render.page = async function (al, page, Wpx, opt) {
  opt = Object.assign({ size: Wpx > 1400 ? 'orig' : 'disp', finish: al.finish }, opt || {});
  const asp = A.model.aspect(al);
  const Hpx = Math.round(Wpx / asp);
  const c = opt.canvas || A.canvas(Wpx, Hpx);
  if (opt.canvas) { c.width = Wpx; c.height = Hpx; }
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  const paper = page && page.bg ? page.bg : A.model.paperColor(al);
  g.fillStyle = paper; g.fillRect(0, 0, Wpx, Hpx);
  if (!(page && page.bg)) { g.fillStyle = g.createPattern(A.render.paperTex(paper), 'repeat'); g.globalAlpha = 0.9; g.fillRect(0, 0, Wpx, Hpx); g.globalAlpha = 1; }
  const bgId = (page && page.bgPhotoId) || al.bgPhotoId;
  if (bgId) {
    const im = await A.render.getImg(bgId, opt.size);
    if (im) { g.globalAlpha = page && page.bgPhotoId ? (page.bgOpacity != null ? page.bgOpacity : 1) : 0.25; A.render.drawCover(g, im, Wpx, Hpx, null); g.globalAlpha = 1; }
  }
  if (page) {
    const els = page.elements.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
    for (const el of els) await A.render.drawElement(g, el, Wpx, Hpx, opt);
  }
  return c;
};

/* כריכה קדמית / אחורית */
A.render.cover = async function (al, Wpx, back) {
  const asp = A.model.aspect(al);
  const Hpx = Math.round(Wpx / asp);
  const c = A.canvas(Wpx, Hpx), g = c.getContext('2d');
  g.fillStyle = al.coverColor; g.fillRect(0, 0, Wpx, Hpx);
  g.fillStyle = g.createPattern(A.render.coverTex(al.coverType, al.coverColor), 'repeat'); g.fillRect(0, 0, Wpx, Hpx);
  const light = isLight(al.coverColor);
  const ink = al.coverType === 'leather' ? (light ? '#9a7a3a' : '#e6c77d') : (light ? '#3a3227' : '#f5efe2');
  /* תפר בכריכת עור / מסגרת הטבעה */
  const m = Wpx * 0.045;
  if (al.coverType === 'leather' || al.coverType === 'fabric') {
    g.strokeStyle = light ? 'rgba(80,60,30,0.45)' : 'rgba(255,240,210,0.45)'; g.lineWidth = Wpx * 0.004; g.setLineDash([Wpx * 0.012, Wpx * 0.008]);
    g.strokeRect(m, m, Wpx - m * 2, Hpx - m * 2); g.setLineDash([]);
  }
  /* תאורה */
  const gr = g.createLinearGradient(0, 0, Wpx, Hpx);
  gr.addColorStop(0, 'rgba(255,255,255,0.14)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = gr; g.fillRect(0, 0, Wpx, Hpx);
  if (!back) {
    let ty = Hpx * 0.5;
    if (al.coverPhotoId) {
      const im = await A.render.getImg(al.coverPhotoId, Wpx > 900 ? 'orig' : 'disp');
      if (im) {
        const pw = Wpx * 0.62, ph = Math.min(Hpx * 0.52, pw * 0.8), px = (Wpx - pw) / 2, py = Hpx * 0.16;
        g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = Wpx * 0.02; g.shadowOffsetY = Wpx * 0.006;
        g.fillStyle = '#f6f1e6'; g.fillRect(px - Wpx * 0.012, py - Wpx * 0.012, pw + Wpx * 0.024, ph + Wpx * 0.024); g.restore();
        g.save(); g.translate(px, py); g.beginPath(); g.rect(0, 0, pw, ph); g.clip(); A.render.drawCover(g, im, pw, ph, null); g.restore();
        ty = py + ph + Hpx * 0.12;
      }
    }
    g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Wpx * 0.075;
    g.font = 'bold ' + fs + 'px ' + A.render.FONTS.serif[1];
    /* הטבעה: צל כהה + הבהרה */
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(al.title || al.name, Wpx / 2 + Wpx * 0.002, ty + Wpx * 0.003, Wpx * 0.85);
    g.fillStyle = ink; g.fillText(al.title || al.name, Wpx / 2, ty, Wpx * 0.85);
    if (al.category) { g.font = Wpx * 0.032 + 'px ' + A.render.FONTS.serif[1]; g.globalAlpha = 0.85; g.fillText(al.category, Wpx / 2, ty + fs * 1.1, Wpx * 0.8); g.globalAlpha = 1; }
  } else {
    g.direction = 'rtl'; g.textAlign = 'center'; g.fillStyle = ink; g.globalAlpha = 0.7;
    g.font = Wpx * 0.026 + 'px ' + A.render.FONTS.serif[1];
    g.fillText('📸 האלבום שלי', Wpx / 2, Hpx * 0.9);
    g.globalAlpha = 1;
  }
  return c;
};
function isLight(hex) { const n = parseInt(String(hex).slice(1), 16); const r = n >> 16, gg = (n >> 8) & 255, b = n & 255; return (r * 0.3 + gg * 0.59 + b * 0.11) > 150; }
A.render.isLight = isLight;

/* צד פנימי של הכריכה (דף בטנה) */
A.render.endpaper = function (al, Wpx) {
  const Hpx = Math.round(Wpx / A.model.aspect(al));
  const c = A.canvas(Wpx, Hpx), g = c.getContext('2d');
  g.fillStyle = A.model.paperColor(al); g.fillRect(0, 0, Wpx, Hpx);
  g.fillStyle = g.createPattern(A.render.paperTex(A.model.paperColor(al)), 'repeat'); g.fillRect(0, 0, Wpx, Hpx);
  g.fillStyle = 'rgba(0,0,0,0.04)';
  for (let y = 0; y < Hpx; y += Wpx * 0.06) for (let x = (y / (Wpx * 0.06)) % 2 ? Wpx * 0.03 : 0; x < Wpx; x += Wpx * 0.06) { g.beginPath(); g.arc(x, y, Wpx * 0.006, 0, 7); g.fill(); }
  return c;
};

/* ---------- תבניות עיצוב (35) ---------- */
/* slot: [x, y, w, h, rot, shape, frame]; t: טקסט */
const T = (id, name, slots, extra) => Object.assign({ id, name, slots }, extra || {});
const M = 0.06;
A.render.TEMPLATES = [
  T('one', 'תמונה אחת גדולה', [[M, M, 1 - 2 * M, 1 - 2 * M]]),
  T('full', 'תמונה מלאה ללא שוליים', [[0, 0, 1, 1]]),
  T('one_cap', 'תמונה עם כיתוב', [[M, M, 1 - 2 * M, 0.72]], { texts: [[M, 0.82, 1 - 2 * M, 0.12, 'כתבו כאן כיתוב', 0.045]] }),
  T('two_v', 'שתיים זו לצד זו', [[M, 0.2, 0.42, 0.6], [0.52, 0.2, 0.42, 0.6]]),
  T('two_h', 'שתיים זו מעל זו', [[M, M, 1 - 2 * M, 0.42], [M, 0.52, 1 - 2 * M, 0.42]]),
  T('two_diag', 'שתיים באלכסון', [[0.06, 0.06, 0.55, 0.45, -3, 'rect', 'white'], [0.38, 0.47, 0.55, 0.45, 3, 'rect', 'white']]),
  T('three_l', 'שלוש — אחת גדולה', [[M, M, 0.55, 1 - 2 * M], [0.65, M, 0.29, 0.42], [0.65, 0.52, 0.29, 0.42]]),
  T('three_row', 'שלוש בשורה', [[M, 0.3, 0.28, 0.4], [0.36, 0.3, 0.28, 0.4], [0.66, 0.3, 0.28, 0.4]]),
  T('three_top', 'גדולה למעלה ושתיים למטה', [[M, M, 1 - 2 * M, 0.5], [M, 0.6, 0.42, 0.34], [0.52, 0.6, 0.42, 0.34]]),
  T('four', 'ארבע בעמוד', [[M, M, 0.42, 0.42], [0.52, M, 0.42, 0.42], [M, 0.52, 0.42, 0.42], [0.52, 0.52, 0.42, 0.42]]),
  T('four_strip', 'ארבע ברצועה', [[M, M, 1 - 2 * M, 0.2], [M, 0.29, 1 - 2 * M, 0.2], [M, 0.52, 1 - 2 * M, 0.2], [M, 0.75, 1 - 2 * M, 0.19]]),
  T('five', 'חמש — מרכז גדול', [[0.25, 0.25, 0.5, 0.5], [M, M, 0.3, 0.3], [0.64, M, 0.3, 0.3], [M, 0.64, 0.3, 0.3], [0.64, 0.64, 0.3, 0.3]]),
  T('six', 'שש בעמוד', [[M, M, 0.42, 0.27], [0.52, M, 0.42, 0.27], [M, 0.365, 0.42, 0.27], [0.52, 0.365, 0.42, 0.27], [M, 0.67, 0.42, 0.27], [0.52, 0.67, 0.42, 0.27]]),
  T('nine', 'תשע — רשת', [0, 1, 2].flatMap(r => [0, 1, 2].map(c => [M + c * 0.3, M + r * 0.3, 0.28, 0.28]))),
  T('family', 'קולא׳ משפחתי', [[0.08, 0.08, 0.5, 0.42, -4, 'rect', 'white'], [0.5, 0.12, 0.42, 0.36, 5, 'rect', 'white'], [0.1, 0.52, 0.38, 0.38, 3, 'rect', 'white'], [0.48, 0.5, 0.44, 0.42, -3, 'rect', 'white']], { texts: [[0.2, 0.9, 0.6, 0.08, 'המשפחה שלנו', 0.05, 'script']] }),
  T('wedding', 'עמוד חתונה', [[0.15, 0.1, 0.7, 0.6, 0, 'arch', 'gold']], { texts: [[0.1, 0.74, 0.8, 0.1, 'היום שבו התחלנו יחד', 0.055, 'script', '#8a6a2a']], deco: [['ring', 0.42, 0.86, 0.16, 0.12]], bg: '#fbf7ee' }),
  T('birthday', 'עמוד יום הולדת', [[0.12, 0.2, 0.76, 0.56, -2, 'rounded', 'white']], { texts: [[0.1, 0.05, 0.8, 0.12, 'יום הולדת שמח!', 0.07, 'sans', '#c23a54']], deco: [['balloons', 0.02, 0.74, 0.22, 0.24], ['cake', 0.76, 0.76, 0.2, 0.2]] }),
  T('trip', 'עמוד טיול', [[M, 0.14, 0.55, 0.5, -2, 'rect', 'polaroid'], [0.5, 0.42, 0.44, 0.44, 4, 'rect', 'polaroid']], { texts: [[M, 0.03, 0.88, 0.1, 'יומן מסע', 0.06, 'mono', '#2f6a8a']], deco: [['plane', 0.08, 0.72, 0.2, 0.16]] }),
  T('antique', 'עמוד בסגנון עתיק', [[0.12, 0.1, 0.76, 0.6, 0, 'rect', 'corners']], { texts: [[0.12, 0.76, 0.76, 0.12, 'זיכרונות מפעם', 0.05, 'serif', '#5a4320']], bg: '#eadcb8' }),
  T('polaroid', 'בסגנון פולארויד', [[0.08, 0.08, 0.46, 0.5, -6, 'rect', 'polaroid'], [0.46, 0.38, 0.46, 0.5, 5, 'rect', 'polaroid']]),
  T('polaroid3', 'שלוש פולארויד', [[0.05, 0.06, 0.42, 0.44, -7, 'rect', 'polaroid'], [0.52, 0.1, 0.42, 0.44, 6, 'rect', 'polaroid'], [0.28, 0.5, 0.42, 0.44, -2, 'rect', 'polaroid']]),
  T('circle', 'תמונה עגולה', [[0.15, 0.15, 0.7, 0.7, 0, 'circle', 'white']]),
  T('circles3', 'שלושה עיגולים', [[0.06, 0.06, 0.5, 0.5, 0, 'circle', 'white'], [0.5, 0.3, 0.42, 0.42, 0, 'circle', 'white'], [0.12, 0.6, 0.34, 0.34, 0, 'circle', 'white']]),
  T('heart', 'תמונה בלב', [[0.12, 0.12, 0.76, 0.72, 0, 'heart', 'none']], { texts: [[0.1, 0.86, 0.8, 0.08, 'באהבה', 0.05, 'script', '#c23a54']] }),
  T('hex', 'כוורת משושים', [[0.08, 0.06, 0.4, 0.4, 0, 'hex', 'none'], [0.52, 0.06, 0.4, 0.4, 0, 'hex', 'none'], [0.3, 0.42, 0.4, 0.4, 0, 'hex', 'none']]),
  T('baby', 'עמוד תינוק', [[0.14, 0.14, 0.72, 0.6, 0, 'rounded', 'white']], { texts: [[0.1, 0.8, 0.8, 0.1, 'ברוכים הבאים לעולם', 0.05, 'script', '#6a8fbf']], deco: [['baby', 0.78, 0.02, 0.18, 0.16]], bg: '#f2f6fb' }),
  T('holiday', 'עמוד חג', [[0.1, 0.18, 0.8, 0.58, 0, 'rect', 'gold']], { texts: [[0.1, 0.04, 0.8, 0.1, 'חג שמח', 0.07, 'serif', '#2a5aa8']], deco: [['pomegranate', 0.06, 0.78, 0.16, 0.16], ['candles', 0.78, 0.78, 0.16, 0.18]] }),
  T('barmitzva', 'עמוד בר/בת מצווה', [[0.12, 0.16, 0.76, 0.56, 0, 'rect', 'white']], { texts: [[0.1, 0.03, 0.8, 0.1, 'מזל טוב!', 0.07, 'serif', '#2a5aa8'], [0.1, 0.78, 0.8, 0.1, 'בר המצווה', 0.05, 'script', '#333']], deco: [['david', 0.42, 0.88, 0.16, 0.1]] }),
  T('memory', 'עמוד זיכרון', [[0.2, 0.1, 0.6, 0.62, 0, 'rect', 'vintage']], { texts: [[0.1, 0.78, 0.8, 0.14, 'לזכרם', 0.05, 'serif', '#444']] }),
  T('quote', 'ציטוט ותמונה', [[M, M, 0.5, 1 - 2 * M]], { texts: [[0.6, 0.3, 0.34, 0.4, 'כתבו כאן משפט או זיכרון', 0.045, 'script', '#444']] }),
  T('title', 'עמוד פתיחה', [], { texts: [[0.1, 0.3, 0.8, 0.16, 'כותרת האלבום', 0.08, 'serif', '#333'], [0.1, 0.5, 0.8, 0.2, 'הקדשה אישית…', 0.045, 'script', '#555']], deco: [['corner', 0.04, 0.04, 0.16, 0.16]] }),
  T('magazine', 'בסגנון מגזין', [[0, 0, 1, 0.66], [M, 0.7, 0.42, 0.26], [0.52, 0.7, 0.42, 0.26]], { texts: [[M, 0.56, 0.6, 0.08, 'כותרת', 0.06, 'sans', '#fff', 1]] }),
  T('filmstrip', 'סרט צילום', [[0.06, 0.1, 0.27, 0.8], [0.365, 0.1, 0.27, 0.8], [0.67, 0.1, 0.27, 0.8]], { bg: '#181818' }),
  T('mosaic', 'פסיפס', [[M, M, 0.56, 0.42], [0.64, M, 0.3, 0.2], [0.64, 0.28, 0.3, 0.2], [M, 0.5, 0.27, 0.44], [0.35, 0.5, 0.59, 0.44]]),
  T('spread', 'תמונה על פני שני עמודים', [[0, 0, 1, 1]], { spread: true })
];

/* החלת תבנית על עמוד: שומר תמונות קיימות לפי סדר */
A.render.applyTemplate = function (page, tpl, photoIds) {
  const old = page.elements.filter(e => e.type === 'photo' && e.photoId).map(e => e.photoId);
  const ids = (photoIds && photoIds.length ? photoIds : old).slice();
  page.elements = page.elements.filter(e => e.type === 'video' || e.type === 'audio');
  tpl.slots.forEach((s, i) => {
    page.elements.push({ id: A.uid(), type: 'photo', x: s[0], y: s[1], w: s[2], h: s[3], rot: s[4] || 0, shape: s[5] || 'rect', frame: s[6] || (tpl.id === 'full' || tpl.id === 'spread' || tpl.id === 'magazine' ? 'none' : 'shadow'), photoId: ids[i] || null, zoom: 1, ox: 0, oy: 0, z: i + 1 });
  });
  (tpl.texts || []).forEach((t, i) => page.elements.push({ id: A.uid(), type: 'text', x: t[0], y: t[1], w: t[2], h: t[3], text: t[4], size: t[5], font: t[6] || 'serif', color: t[7] || '#333', shadow: !!t[8], align: 'center', rot: 0, z: 50 + i }));
  (tpl.deco || []).forEach((d, i) => page.elements.push({ id: A.uid(), type: 'sticker', illus: d[0], x: d[1], y: d[2], w: d[3], h: d[4], rot: 0, z: 80 + i }));
  if (tpl.bg !== undefined) page.bg = tpl.bg;
  page.template = tpl.id;
  return ids.slice(tpl.slots.length);
};

/* בחירת תבנית מתאימה לפי מספר תמונות ויחס */
A.render.autoTemplate = function (photos) {
  const n = photos.length;
  const land = photos.filter(p => p && p.w > p.h).length;
  const pick = ids => { const id = ids[Math.floor(Math.random() * ids.length)]; return A.render.TEMPLATES.find(t => t.id === id) || A.render.TEMPLATES[0]; };
  if (n <= 1) return pick(land ? ['one', 'one_cap', 'full'] : ['one', 'circle', 'one_cap']);
  if (n === 2) return pick(land === 2 ? ['two_h', 'two_diag'] : land === 0 ? ['two_v', 'polaroid'] : ['two_diag', 'polaroid']);
  if (n === 3) return pick(land >= 2 ? ['three_top', 'polaroid3'] : ['three_l', 'three_row', 'circles3']);
  if (n === 4) return pick(['four', 'family', 'four_strip']);
  if (n === 5) return pick(['five', 'mosaic']);
  if (n === 6) return pick(['six']);
  return pick(['nine']);
};
