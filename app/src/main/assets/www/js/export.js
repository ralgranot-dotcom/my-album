/* האלבום שלי — יצוא: PDF והדפסה, תמונות, אלבום אינטראקטיבי, סרטון דפדוף, מצגת ושיתוף */
'use strict';
A.exporter = {};

A.exporter.menu = function (al) {
  const items = [
    ['📄', 'קובץ PDF לצפייה ושיתוף', () => A.exporter.pdfFlow(al, false)],
    ['🖨️', 'קובץ PDF להדפסה מקצועית', () => A.exporter.pdfFlow(al, true)],
    ['📕', 'כריכה להדפסה (PDF)', () => A.exporter.coverPdf(al)],
    ['🖼️', 'עמודים כתמונות JPG / PNG', () => A.exporter.imagesFlow(al)],
    ['🌐', 'אלבום דיגיטלי אינטראקטיבי (נפתח בכל דפדפן)', () => A.exporter.interactive(al)],
    ['🎬', 'סרטון דפדוף באלבום', () => A.exporter.video(al, 'flip')],
    ['🎞️', 'סרטון מצגת תמונות', () => A.exporter.video(al, 'slides')],
    ['▶️', 'הפעלת מצגת עכשיו', () => A.exporter.slideshow(al)],
    ['📲', 'העברה למכשיר אחר (קובץ אלבום)', () => A.backup.exportAlbum(al)]
  ];
  const box = A.h('div.list'); let close;
  items.forEach(([i, l, f]) => box.appendChild(A.h('button.list-item', { type: 'button', onclick: () => { close(); f(); } }, i + ' ' + l)));
  A.modal('📤 יצוא ושיתוף — ' + al.name, box, [{ label: 'סגירה', value: null }], { onOpen: (c, cl) => { close = cl; } });
};

/* בחירה: שמירה / וואטסאפ / דוא"ל / שיתוף */
A.exporter.deliver = async function (blob, filename) {
  const sz = A.fmtBytes(blob.size);
  const act = await A.modal('הקובץ מוכן ✅', A.h('div', null, A.h('p', null, filename), A.h('p.muted', null, 'גודל: ' + sz + (blob.size > 100 * 1048576 ? ' — קובץ גדול; שיתוף בוואטסאפ מוגבל ל-2 ג״ב.' : ''))), [
    { label: '💾 שמירה במכשיר', value: 'save', cls: 'primary' }, { label: '🟢 וואטסאפ', value: 'whatsapp' }, { label: '✉️ דו״ל', value: 'email' }, { label: '📤 שיתוף אחר', value: 'share' }]);
  if (!act) return;
  const pr = A.progress('מעביר את הקובץ…');
  try {
    const r = await A.saveFile(blob, filename, act, f => pr.set(f));
    pr.done();
    if (act === 'save') A.toast('💾 נשמר: ' + (typeof r === 'string' ? r : 'בתיקיית ההורדות'), 4500);
  } catch (e) { pr.done(); A.alert('הפעולה נכשלה', e.message); }
};

/* ---------------- PDF ---------------- */
A.pdf = function () {
  const parts = []; let size = 0; const offsets = [];
  const enc = new TextEncoder();
  const w = s => { const b = typeof s === 'string' ? enc.encode(s) : s; parts.push(b); size += b.length; };
  let nObj = 0;
  const alloc = () => ++nObj;
  const begin = id => { offsets[id] = size; w(id + ' 0 obj\n'); };
  w('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\u0080-ÿ]/g, c => c));
  return {
    alloc, size: () => size,
    obj(id, body) { begin(id); w(body + '\nendobj\n'); },
    stream(id, dict, data) { begin(id); w(dict.replace(/>>$/, '/Length ' + data.length + '>>') + '\nstream\n'); w(data); w('\nendstream\nendobj\n'); },
    finish(rootId, infoId) {
      const x = size;
      let t = 'xref\n0 ' + (nObj + 1) + '\n0000000000 65535 f \n';
      for (let i = 1; i <= nObj; i++) t += String(offsets[i] || 0).padStart(10, '0') + ' 00000 n \n';
      t += 'trailer\n<</Size ' + (nObj + 1) + '/Root ' + rootId + ' 0 R' + (infoId ? '/Info ' + infoId + ' 0 R' : '') + '>>\nstartxref\n' + x + '\n%%EOF';
      w(t);
      return new Blob(parts, { type: 'application/pdf' });
    }
  };
};
const MM = 72 / 25.4;
const PAPERS = { album: 'גודל האלבום', a4: 'A4', a5: 'A5', letter: 'Letter', sq20: '20×20 ס״מ', sq30: '30×30 ס״מ' };
function paperSize(al, key) {
  const albumMM = al.size === 'landscape' ? [300, 210] : al.size === 'portrait' ? [210, 300] : [300, 300];
  if (key === 'a4') return al.size === 'landscape' ? [297, 210] : [210, 297];
  if (key === 'a5') return al.size === 'landscape' ? [210, 148] : [148, 210];
  if (key === 'letter') return al.size === 'landscape' ? [279.4, 215.9] : [215.9, 279.4];
  if (key === 'sq20') return [200, 200];
  if (key === 'sq30') return [300, 300];
  return albumMM;
}
function pdfStr(s) { /* מחרוזת מידע בקידוד UTF-16BE */ let h = 'FEFF'; for (const ch of String(s)) { const c = ch.codePointAt(0); if (c > 0xffff) { const v = c - 0x10000; h += ((0xD800 + (v >> 10)).toString(16) + (0xDC00 + (v & 0x3ff)).toString(16)).toUpperCase(); } else h += c.toString(16).padStart(4, '0').toUpperCase(); } return '<' + h + '>'; }

A.exporter.pdfFlow = async function (al, print) {
  const f = A.h('div.form');
  const paper = A.h('select.inp', null, Object.entries(PAPERS).map(([k, l]) => A.h('option', { value: k }, l)));
  const dpi = A.h('select.inp', null, [[150, '150 DPI (קובץ קל לשיתוף)'], [200, '200 DPI'], [300, '300 DPI (הדפסה מקצועית)']].map(([v, l]) => A.h('option', { value: v, selected: v === (print ? 300 : 150) }, l)));
  const margin = A.h('input.inp', { type: 'number', min: 0, max: 30, value: print ? 0 : 0 });
  const bleed = A.h('input.inp', { type: 'number', min: 0, max: 10, value: print ? 3 : 0 });
  const marks = A.h('input', { type: 'checkbox', checked: print });
  const covers = A.h('input', { type: 'checkbox', checked: !print });
  f.append(A.h('label.field', null, A.h('span', null, 'גודל דף'), paper), A.h('label.field', null, A.h('span', null, 'איכות'), dpi),
    A.h('label.field', null, A.h('span', null, 'שוליים (מ״מ)'), margin),
    print ? A.h('label.field', null, A.h('span', null, 'אזור חיתוך / גלישה (מ״מ)'), bleed) : null,
    print ? A.h('label.check', null, marks, ' סימני חיתוך') : null,
    A.h('label.check', null, covers, ' לכלול כריכה קדמית ואחורית'));
  const ok = await A.modal(print ? '🖨️ הכנה להדפסה' : '📄 יצוא PDF', f, [{ label: 'ביטול', value: false }, { label: 'יצירה', value: true, cls: 'primary' }]);
  if (!ok) return;
  const opts = { paper: paper.value, dpi: +dpi.value, margin: +margin.value || 0, bleed: print ? +bleed.value || 0 : 0, marks: print && marks.checked, covers: covers.checked };
  /* בדיקת רזולוציה */
  const low = await A.exporter.lowRes(al, opts);
  if (low.length && opts.dpi >= 300) {
    const go = await A.modal('⚠️ תמונות ברזולוציה נמוכה', A.h('div', null, A.h('p', null, low.length + ' תמונות לא מגיעות ל-300DPI בגודל שבו הן מוצגות (האיכות תהיה הטובה ביותר שהמקור מאפשר):'), A.h('ul.info', null, low.slice(0, 8).map(l => A.h('li', null, 'עמוד ' + l.page + ': כ-' + l.dpi + ' DPI')))), [{ label: 'ביטול', value: false }, { label: 'להמשיך', value: true, cls: 'primary' }]);
    if (!go) return;
  }
  const blob = await A.exporter.buildPdf(al, opts);
  if (blob) A.exporter.deliver(blob, A.safeName(al.name) + (print ? '_להדפסה' : '') + '.pdf');
};

A.exporter.lowRes = async function (al, opts) {
  const [pw] = paperSize(al, opts.paper);
  const out = [];
  for (let i = 0; i < al.pages.length; i++) for (const e of al.pages[i].elements) {
    if (e.type !== 'photo' || !e.photoId) continue;
    const p = await A.db.photo(e.photoId); if (!p) continue;
    const pxw = (p.hasEdit ? p.ew || p.w : p.w) / (e.half ? 2 : 1) / (e.zoom || 1);
    const inch = Math.max(0.1, e.w * (pw - opts.margin * 2) / 25.4);
    const dpi = Math.round(pxw / inch);
    if (dpi < 300) out.push({ page: i + 1, dpi });
  }
  return out;
};

A.exporter.buildPdf = async function (al, opts) {
  const [pwMM, phMM] = paperSize(al, opts.paper);
  const asp = A.model.aspect(al);
  const markMM = opts.marks ? 10 : 0;
  const mediaW = (pwMM + opts.bleed * 2 + markMM * 2) * MM, mediaH = (phMM + opts.bleed * 2 + markMM * 2) * MM;
  /* אזור התוכן בתוך השוליים, שומר על יחס האלבום */
  let cw = pwMM - opts.margin * 2, ch = phMM - opts.margin * 2;
  if (cw / ch > asp) cw = ch * asp; else ch = cw / asp;
  const pxW = Math.round(cw / 25.4 * opts.dpi);
  const sides = [];
  if (opts.covers) sides.push({ kind: 'cover' });
  al.pages.forEach((p, i) => sides.push({ kind: 'page', i }));
  if (opts.covers) sides.push({ kind: 'back' });
  const pdf = A.pdf();
  const catalog = pdf.alloc(), pagesId = pdf.alloc(), info = pdf.alloc();
  const kids = [];
  const pr = A.progress('יוצר PDF…');
  try {
    for (let k = 0; k < sides.length; k++) {
      if (pr.cancelled) { pr.done(); return null; }
      pr.set(k / sides.length, 'עמוד ' + (k + 1) + ' מתוך ' + sides.length);
      const sd = sides[k];
      const c = sd.kind === 'cover' ? await A.render.cover(al, pxW, false) : sd.kind === 'back' ? await A.render.cover(al, pxW, true) : await A.render.page(al, al.pages[sd.i], pxW, { size: 'orig' });
      const jpg = new Uint8Array(await (await A.canvasToBlob(c, 'image/jpeg', 0.92)).arrayBuffer());
      const img = pdf.alloc(), cont = pdf.alloc(), page = pdf.alloc();
      pdf.stream(img, '<</Type/XObject/Subtype/Image/Width ' + c.width + '/Height ' + c.height + '/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode>>', jpg);
      /* מיקום: אם יש גלישה, התמונה מכסה גם את אזור הגלישה */
      const trimX = (markMM + opts.bleed) * MM, trimY = (markMM + opts.bleed) * MM;
      let ix, iy, iw, ih;
      if (opts.bleed && !opts.margin) { ix = markMM * MM; iy = markMM * MM; iw = (pwMM + opts.bleed * 2) * MM; ih = (phMM + opts.bleed * 2) * MM; }
      else { iw = cw * MM; ih = ch * MM; ix = trimX + (pwMM * MM - iw) / 2; iy = trimY + (phMM * MM - ih) / 2; }
      let cs = 'q ' + iw.toFixed(2) + ' 0 0 ' + ih.toFixed(2) + ' ' + ix.toFixed(2) + ' ' + iy.toFixed(2) + ' cm /Im0 Do Q\n';
      if (opts.marks) {
        const L = 7 * MM, g = 2 * MM;
        const xs = [trimX, trimX + pwMM * MM], ys = [trimY, trimY + phMM * MM];
        cs += '0 G 0.3 w\n';
        xs.forEach((x, xi) => ys.forEach((y, yi) => {
          const sx = xi ? 1 : -1, sy = yi ? 1 : -1;
          cs += (x + sx * (opts.bleed * MM + g)).toFixed(2) + ' ' + y.toFixed(2) + ' m ' + (x + sx * (opts.bleed * MM + g + L)).toFixed(2) + ' ' + y.toFixed(2) + ' l S\n';
          cs += x.toFixed(2) + ' ' + (y + sy * (opts.bleed * MM + g)).toFixed(2) + ' m ' + x.toFixed(2) + ' ' + (y + sy * (opts.bleed * MM + g + L)).toFixed(2) + ' l S\n';
        }));
      }
      pdf.stream(cont, '<<>>', new TextEncoder().encode(cs));
      const box = a => '[' + a.map(v => v.toFixed(2)).join(' ') + ']';
      pdf.obj(page, '<</Type/Page/Parent ' + pagesId + ' 0 R/MediaBox ' + box([0, 0, mediaW, mediaH]) +
        '/TrimBox ' + box([trimX, trimY, trimX + pwMM * MM, trimY + phMM * MM]) +
        '/BleedBox ' + box([markMM * MM, markMM * MM, mediaW - markMM * MM, mediaH - markMM * MM]) +
        '/Resources<</XObject<</Im0 ' + img + ' 0 R>>>>/Contents ' + cont + ' 0 R>>');
      kids.push(page);
      await A.sleep(0);
    }
    pdf.obj(pagesId, '<</Type/Pages/Count ' + kids.length + '/Kids[' + kids.map(k => k + ' 0 R').join(' ') + ']>>');
    pdf.obj(catalog, '<</Type/Catalog/Pages ' + pagesId + ' 0 R/ViewerPreferences<</Direction/R2L>>>>');
    pdf.obj(info, '<</Title ' + pdfStr(al.name) + '/Creator ' + pdfStr('האלבום שלי ' + A.VERSION) + '/Producer ' + pdfStr('האלבום שלי') + '>>');
    const blob = pdf.finish(catalog, info);
    pr.done();
    return blob;
  } catch (e) { pr.done(); A.alert('יצירת ה-PDF נכשלה', e.message + (/memory|alloc/i.test(e.message) ? ' — נסו איכות נמוכה יותר.' : '')); return null; }
};

/* כריכה להדפסה: אחורית | שדרה | קדמית (ספר עברי — הקדמית מימין) */
A.exporter.coverPdf = async function (al) {
  const [pwMM, phMM] = paperSize(al, 'album');
  const spineMM = Math.max(6, Math.round(2 + al.pages.length * 0.18));
  const bleed = 5, wrap = 15;
  const dpi = 300;
  const totalWmm = pwMM * 2 + spineMM + (bleed + wrap) * 2, totalHmm = phMM + (bleed + wrap) * 2;
  const px = mm => Math.round(mm / 25.4 * dpi);
  const pr = A.progress('יוצר כריכה להדפסה…');
  try {
    const c = A.canvas(px(totalWmm), px(totalHmm)), g = c.getContext('2d');
    g.fillStyle = al.coverColor; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = g.createPattern(A.render.coverTex(al.coverType, al.coverColor), 'repeat'); g.fillRect(0, 0, c.width, c.height);
    pr.set(0.3);
    const back = await A.render.cover(al, px(pwMM), true), front = await A.render.cover(al, px(pwMM), false);
    const off = px(bleed + wrap);
    g.drawImage(back, off, off, px(pwMM), px(phMM));
    g.drawImage(front, off + px(pwMM + spineMM), off, px(pwMM), px(phMM));
    /* שדרה */
    const sx = off + px(pwMM);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(sx, 0, px(spineMM), c.height);
    g.save(); g.translate(sx + px(spineMM) / 2, off + px(phMM) / 2); g.rotate(Math.PI / 2);
    g.fillStyle = A.render.isLight(al.coverColor) ? '#3a3227' : '#f0e2bb'; g.font = 'bold ' + Math.min(px(spineMM) * 0.6, px(8)) + 'px ' + A.render.FONTS.serif[1];
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.fillText(al.title || al.name, 0, 0, px(phMM) * 0.8); g.restore();
    /* קווי עזר דקים: קפל וחיתוך */
    g.strokeStyle = 'rgba(255,0,180,0.6)'; g.lineWidth = 2; g.setLineDash([12, 10]);
    [off, sx, sx + px(spineMM), off + px(pwMM * 2 + spineMM)].forEach(x => { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); });
    [off, off + px(phMM)].forEach(y => { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); });
    pr.set(0.7);
    const jpg = new Uint8Array(await (await A.canvasToBlob(c, 'image/jpeg', 0.92)).arrayBuffer());
    const pdf = A.pdf(); const cat = pdf.alloc(), pages = pdf.alloc(), img = pdf.alloc(), cont = pdf.alloc(), page = pdf.alloc();
    const W = totalWmm * MM, H = totalHmm * MM;
    pdf.stream(img, '<</Type/XObject/Subtype/Image/Width ' + c.width + '/Height ' + c.height + '/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode>>', jpg);
    pdf.stream(cont, '<<>>', new TextEncoder().encode('q ' + W.toFixed(2) + ' 0 0 ' + H.toFixed(2) + ' 0 0 cm /Im0 Do Q'));
    pdf.obj(page, '<</Type/Page/Parent ' + pages + ' 0 R/MediaBox[0 0 ' + W.toFixed(2) + ' ' + H.toFixed(2) + ']/Resources<</XObject<</Im0 ' + img + ' 0 R>>>>/Contents ' + cont + ' 0 R>>');
    pdf.obj(pages, '<</Type/Pages/Count 1/Kids[' + page + ' 0 R]>>');
    pdf.obj(cat, '<</Type/Catalog/Pages ' + pages + ' 0 R>>');
    const blob = pdf.finish(cat);
    pr.done();
    await A.alert('📕 כריכה להדפסה', 'נוצרה כריכה פרוסה: אחורית | שדרה ברוחב ' + spineMM + ' מ״מ | קדמית, 300DPI, עם ' + bleed + ' מ״מ גלישה ו-' + wrap + ' מ״מ קיפול. הקווים הוורודים מסמנים קיפול וחיתוך.');
    A.exporter.deliver(blob, A.safeName(al.name) + '_כריכה.pdf');
  } catch (e) { pr.done(); A.alert('יצירת הכריכה נכשלה', e.message); }
};

/* ---------------- תמונות ---------------- */
A.exporter.imagesFlow = async function (al) {
  const fmt = A.h('select.inp', null, A.h('option', { value: 'jpg' }, 'JPG'), A.h('option', { value: 'png' }, 'PNG (איכות מקסימלית, קובץ גדול)'));
  const res = A.h('select.inp', null, [[1600, '1600 פיקסלים'], [2400, '2400 פיקסלים'], [3543, '3543 פיקסלים (30 ס״מ ב-300DPI)']].map(([v, l]) => A.h('option', { value: v }, l)));
  const zip = A.h('input', { type: 'checkbox', checked: true });
  const ok = await A.modal('🖼️ עמודים כתמונות', A.h('div.form', null, A.h('label.field', null, A.h('span', null, 'פורמט'), fmt), A.h('label.field', null, A.h('span', null, 'רוחב'), res), A.h('label.check', null, zip, ' לארוז הכול בקובץ ZIP אחד')), [{ label: 'ביטול', value: false }, { label: 'יצוא', value: true, cls: 'primary' }]);
  if (!ok) return;
  const png = fmt.value === 'png', W = +res.value;
  const pr = A.progress('מייצא עמודים…');
  try {
    const files = [];
    for (let i = 0; i < al.pages.length; i++) {
      if (pr.cancelled) break;
      pr.set(i / al.pages.length, 'עמוד ' + (i + 1));
      const c = await A.render.page(al, al.pages[i], W, { size: 'orig' });
      const b = await A.canvasToBlob(c, png ? 'image/png' : 'image/jpeg', 0.93);
      const name = A.safeName(al.name) + '_עמוד_' + String(i + 1).padStart(3, '0') + (png ? '.png' : '.jpg');
      if (zip.checked) files.push({ name, blob: b });
      else await A.saveFile(b, name, 'save');
    }
    pr.done();
    if (pr.cancelled) return;
    if (zip.checked) { const z = await A.zip.make(files); A.exporter.deliver(z, A.safeName(al.name) + '_עמודים.zip'); }
    else A.toast('💾 ' + al.pages.length + ' תמונות נשמרו בתיקיית ההורדות', 4000);
  } catch (e) { pr.done(); A.alert('היצוא נכשל', e.message); }
};

/* ---------------- אלבום אינטראקטיבי (HTML עצמאי) ---------------- */
A.exporter.interactive = async function (al) {
  const pr = A.progress('בונה אלבום דיגיטלי…');
  try {
    const W = 1000;
    const imgs = [];
    const all = [{ k: 'cover' }].concat(al.pages.map((p, i) => ({ k: 'p', i })), [{ k: 'back' }]);
    for (let j = 0; j < all.length; j++) {
      if (pr.cancelled) { pr.done(); return; }
      pr.set(j / all.length, 'עמוד ' + (j + 1));
      const s = all[j];
      const c = s.k === 'cover' ? await A.render.cover(al, W) : s.k === 'back' ? await A.render.cover(al, W, true) : await A.render.page(al, al.pages[s.i], W);
      imgs.push(await A.blobToDataURL(await A.canvasToBlob(c, 'image/jpeg', 0.82)));
    }
    const asp = A.model.aspect(al);
    const html = '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + A.esc(al.name) + '</title><style>' +
      'body{margin:0;background:radial-gradient(#6b4a2f,#2b1d12);font-family:sans-serif;color:#fff;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}' +
      '#bk{position:relative;perspective:2200px}#bk .pg{position:absolute;top:0;width:50%;height:100%;background-size:cover;box-shadow:0 0 18px rgba(0,0,0,.4)}' +
      '.lf{position:absolute;top:0;left:0;width:50%;height:100%;transform-origin:right center;transform-style:preserve-3d;transition:transform .8s cubic-bezier(.4,.1,.2,1)}' +
      '.lf div{position:absolute;inset:0;background-size:cover;backface-visibility:hidden}.lf .b{transform:rotateY(180deg)}' +
      'h1{font-size:18px;margin:8px}nav{margin-top:14px}button{font-size:22px;margin:0 10px;padding:6px 18px;border-radius:20px;border:0;background:#f3e6c8}' +
      '</style></head><body><h1>📸 ' + A.esc(al.name) + '</h1><div id="bk"></div><nav><button id="nx">‹ הבא</button><button id="pv">הקודם ›</button></nav><script>' +
      'var I=' + JSON.stringify(imgs) + ',A=' + asp + ',bk=document.getElementById("bk"),pos=0,busy=0;' +
      'function sz(){var w=Math.min(innerWidth*0.94,(innerHeight-140)*A*2);bk.style.width=w+"px";bk.style.height=(w/2/A)+"px";}' +
      'function sd(p){var n=I.length-2;if(p<=0)return[null,I[0]];if(p>n/2+1)return[I[I.length-1],null];if(p==1)return["e",I[1]];var r=2*p-2,l=2*p-1;return[I[r]||"e",l<=n?I[l]:"e"];}' +
      'function pg(side,u){var d=document.createElement("div");d.className="pg";d.style[side]="0";if(u=="e"){d.style.background="#f6f1e6"}else d.style.backgroundImage="url("+u+")";return d}' +
      'function show(){bk.innerHTML="";var s=sd(pos);if(s[0])bk.appendChild(pg("right",s[0]));if(s[1])bk.appendChild(pg("left",s[1]));bk.style.transform=pos<=0?"translateX(-25%)":(pos>(I.length-2)/2+1?"translateX(25%)":"")}' +
      'function go(d){if(busy)return;var t=pos+d,n=(I.length-2)/2+1;if(t<0||t>n+1)return;busy=1;var c=sd(pos),x=sd(t),lf=document.createElement("div");lf.className="lf";' +
      'var f=document.createElement("div"),b=document.createElement("div");b.className="b";var fu=d>0?c[1]:c[0],bu=d>0?x[0]:x[1];f.style.backgroundImage=fu=="e"?"":"url("+fu+")";if(fu=="e")f.style.background="#f6f1e6";b.style.backgroundImage=bu=="e"?"":"url("+bu+")";if(bu=="e")b.style.background="#f6f1e6";lf.appendChild(f);lf.appendChild(b);' +
      'if(d<0){lf.style.left="50%";lf.style.transformOrigin="left center"}var un=d>0?x[1]:x[0];var old=bk.querySelector(d>0?".pg[style*=left]":".pg[style*=right]");if(old)old.remove();if(un)bk.appendChild(pg(d>0?"left":"right",un));bk.appendChild(lf);' +
      'requestAnimationFrame(function(){requestAnimationFrame(function(){lf.style.transform="rotateY("+(d>0?180:-180)+"deg)"})});setTimeout(function(){pos=t;show();busy=0},820)}' +
      'document.getElementById("nx").onclick=function(){go(1)};document.getElementById("pv").onclick=function(){go(-1)};' +
      'var sx=0;bk.addEventListener("touchstart",function(e){sx=e.touches[0].clientX});bk.addEventListener("touchend",function(e){var dx=e.changedTouches[0].clientX-sx;if(dx>40)go(1);else if(dx<-40)go(-1)});' +
      'addEventListener("resize",sz);sz();show();<\/script></body></html>';
    pr.done();
    A.exporter.deliver(new Blob([html], { type: 'text/html' }), A.safeName(al.name) + '_אלבום_דיגיטלי.html');
  } catch (e) { pr.done(); A.alert('היצוא נכשל', e.message); }
};

/* ---------------- סרטונים ---------------- */
A.exporter.video = async function (al, kind) {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return A.alert('לא נתמך', 'יצירת סרטון אינה נתמכת במכשיר זה.');
  const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  if (!mime) return A.alert('לא נתמך', 'אין במכשיר מקודד וידאו מתאים.');
  const ok = await A.confirm(kind === 'flip' ? '🎬 סרטון דפדוף' : '🎞️ סרטון מצגת', 'הסרטון נוצר בזמן אמת — יש להשאיר את המסך פתוח עד הסיום. ' + (al.musicId ? 'מוזיקת הרקע של האלבום תשולב בסרטון.' : ''), 'התחלה');
  if (!ok) return;
  const VW = 1280, VH = 720, FPS = 30;
  const c = A.canvas(VW, VH), g = c.getContext('2d');
  const stream = c.captureStream(FPS);
  let audioEl = null, actx = null;
  if (al.musicId) {
    try {
      const u = await A.cache.url(al.musicId + ':data');
      audioEl = new Audio(u); audioEl.loop = true;
      actx = new AudioContext();
      const src = actx.createMediaElementSource(audioEl), dest = actx.createMediaStreamDestination();
      src.connect(dest);
      dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch (e) { audioEl = null; }
  }
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 });
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const pr = A.progress('מקליט סרטון…');
  const table = (() => { const t = A.render.coverTex('wood', '#5a3a22'); return g.createPattern(t, 'repeat'); })();
  try {
    /* הכנת תמונות */
    const asp = A.model.aspect(al);
    const ph = VH * 0.82, pw = Math.min(ph * asp, VW * 0.46);
    const phh = pw / asp;
    let frames;
    if (kind === 'flip') {
      const sides = [await A.render.cover(al, Math.round(pw * 1.5))];
      sides.push(A.render.endpaper(al, Math.round(pw * 1.5)));
      for (const p of al.pages) sides.push(await A.render.page(al, p, Math.round(pw * 1.5)));
      sides.push(A.render.endpaper(al, Math.round(pw * 1.5)));
      sides.push(await A.render.cover(al, Math.round(pw * 1.5), true));
      frames = { sides };
    } else {
      const ids = []; al.pages.forEach(p => p.elements.forEach(e => { if (e.type === 'photo' && e.photoId && !ids.includes(e.photoId)) ids.push(e.photoId); }));
      if (!ids.length) { pr.done(); return A.alert('אין תמונות', 'באלבום אין תמונות למצגת.'); }
      frames = { ids };
    }
    rec.start(500);
    if (audioEl) { audioEl.currentTime = 0; audioEl.play().catch(() => {}); }
    const t0 = performance.now();
    const drawBg = () => { g.fillStyle = table; g.fillRect(0, 0, VW, VH); const v = g.createRadialGradient(VW / 2, VH / 2, VH * 0.2, VW / 2, VH / 2, VW * 0.7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = v; g.fillRect(0, 0, VW, VH); };
    const cx = VW / 2, top = (VH - phh) / 2;
    const shadow = (x, w) => { g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 30; g.shadowOffsetY = 12; g.fillStyle = '#000'; g.fillRect(x, top, w, phh); g.restore(); };
    const frame = () => new Promise(r => requestAnimationFrame(r));
    if (kind === 'flip') {
      const S = frames.sides; /* 0 cover,1 end,2.. pages, end, back */
      const n = al.pages.length;
      const spreadSides = pos => pos === 0 ? [null, S[0]] : pos > n / 2 + 1 ? [S[S.length - 1], null] : [S[2 * pos - 1], S[2 * pos]];
      const total = n / 2 + 2;
      const drawSpread = (sp, shift) => {
        if (sp[0]) { shadow(cx + shift, pw); g.drawImage(sp[0], cx + shift, top, pw, phh); }
        if (sp[1]) { shadow(cx - pw + shift, pw); g.drawImage(sp[1], cx - pw + shift, top, pw, phh); }
        if (sp[0] && sp[1]) { const gr = g.createLinearGradient(cx - 30 + shift, 0, cx + 30 + shift, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(cx - 30 + shift, top, 60, phh); }
      };
      const shiftOf = pos => pos === 0 ? pw / 2 : pos > n / 2 + 1 ? -pw / 2 : 0;
      for (let pos = 0; pos < total; pos++) {
        if (pr.cancelled) break;
        pr.set(pos / total, 'פריסה ' + (pos + 1) + ' מתוך ' + total);
        /* החזקה */
        const hold = performance.now();
        while (performance.now() - hold < (pos === 0 ? 1500 : 2200)) { drawBg(); drawSpread(spreadSides(pos), shiftOf(pos)); await frame(); }
        /* דפדוף */
        const cur = spreadSides(pos), nxt = spreadSides(pos + 1);
        const f0 = performance.now(), dur = 900;
        while (true) {
          const k = Math.min(1, (performance.now() - f0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          const shift = shiftOf(pos) + (shiftOf(pos + 1) - shiftOf(pos)) * e;
          drawBg();
          drawSpread([cur[0], nxt[1]], shift);
          /* העלה: מתכווץ בצד שמאל ואז נפתח בצד ימין */
          const fx = cx + shift;
          if (e < 0.5) { const w = pw * Math.cos(e * Math.PI); if (cur[1]) { g.drawImage(cur[1], fx - w, top - 6 * Math.sin(e * Math.PI), w, phh); g.fillStyle = 'rgba(0,0,0,' + (e * 0.6) + ')'; g.fillRect(fx - w, top, w, phh); } }
          else { const w = pw * -Math.cos(e * Math.PI); if (nxt[0]) { g.drawImage(nxt[0], fx, top - 6 * Math.sin(e * Math.PI), w, phh); g.fillStyle = 'rgba(0,0,0,' + ((1 - e) * 0.6) + ')'; g.fillRect(fx, top, w, phh); } }
          await frame();
          if (k >= 1) break;
        }
      }
      const hold = performance.now();
      while (performance.now() - hold < 1500) { drawBg(); drawSpread(spreadSides(total), shiftOf(total)); await frame(); }
    } else {
      const ids = frames.ids;
      let prev = null;
      for (let i = 0; i < ids.length; i++) {
        if (pr.cancelled) break;
        pr.set(i / ids.length, 'תמונה ' + (i + 1) + ' מתוך ' + ids.length);
        const im = await A.render.getImg(ids[i], 'disp');
        if (!im) continue;
        const s0 = performance.now(), dur = 3200;
        while (true) {
          const k = Math.min(1, (performance.now() - s0) / dur);
          g.fillStyle = '#000'; g.fillRect(0, 0, VW, VH);
          const draw = (img, kk, alpha) => {
            const z = 1.05 + kk * 0.1 * (i % 2 ? 1 : -1) + (i % 2 ? 0 : 0.1);
            g.save(); g.globalAlpha = alpha; g.translate(VW / 2, VH / 2); g.scale(z, z); g.translate(-VW / 2 + (i % 3 - 1) * kk * 20, -VH / 2);
            const s = Math.min(VW / img.width, VH / img.height); const w = img.width * s, h = img.height * s;
            g.drawImage(img, (VW - w) / 2, (VH - h) / 2, w, h); g.restore();
          };
          if (prev && k < 0.25) draw(prev, 1, 1);
          draw(im, k, prev ? Math.min(1, k / 0.25) : 1);
          await frame();
          if (k >= 1) break;
        }
        prev = im;
      }
    }
    await new Promise(r => { rec.onstop = r; rec.stop(); });
    if (audioEl) audioEl.pause();
    if (actx) actx.close();
    pr.done();
    if (pr.cancelled) return;
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    A.exporter.deliver(blob, A.safeName(al.name) + (kind === 'flip' ? '_דפדוף.' : '_מצגת.') + ext);
  } catch (e) {
    try { rec.stop(); } catch (x) { /* כבר נעצר */ }
    if (audioEl) audioEl.pause();
    pr.done(); A.alert('יצירת הסרטון נכשלה', e.message);
  }
};

/* ---------------- מצגת על המסך ---------------- */
A.exporter.slideshow = async function (al) {
  const ids = []; al.pages.forEach(p => p.elements.forEach(e => { if (e.type === 'photo' && e.photoId && !ids.includes(e.photoId)) ids.push(e.photoId); }));
  if (!ids.length) return A.alert('אין תמונות', 'באלבום אין תמונות למצגת.');
  const a = A.h('img.ss-img.a', { alt: '' }), b = A.h('img.ss-img.b', { alt: '' });
  const cap = A.h('div.ss-cap');
  const box = A.h('div.slideshow', null, a, b, cap, A.h('button.lb-x', { type: 'button', 'aria-label': 'סגירה', onclick: () => close() }, '✕'));
  document.body.appendChild(box);
  let music = null;
  if (al.musicId) { const u = await A.cache.url(al.musicId + ':data'); if (u) { music = new Audio(u); music.loop = true; music.play().catch(() => {}); } }
  let i = 0, front = a, stop = false;
  const show = async () => {
    if (stop) return;
    const p = await A.db.photo(ids[i % ids.length]);
    const u = await A.cache.photoUrl(p, 'disp');
    const back = front === a ? b : a;
    back.src = u; back.classList.remove('kb'); void back.offsetWidth; back.classList.add('kb');
    back.style.opacity = 1; front.style.opacity = 0; front = back;
    cap.textContent = (p && p.caption) || '';
    i++;
    timer = setTimeout(show, 4200);
  };
  let timer = null;
  const close = () => { stop = true; clearTimeout(timer); if (music) music.pause(); box.remove(); A.backStack.pop(); };
  A.backStack.push(close);
  show();
};
