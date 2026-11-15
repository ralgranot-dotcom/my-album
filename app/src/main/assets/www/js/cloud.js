/* האלבום שלי — כלים חכמים במכשיר + ענן: פרסום עם QR, אלבום משפחתי משותף, גיבוי לענן */
'use strict';

A.CLOUD = {
  FN: 'https://ddytetgcdygmufitgxeg.supabase.co/functions/v1/myalbum',
  PUB: 'https://ddytetgcdygmufitgxeg.supabase.co/storage/v1/object/public/myalbum-pub/',
  SITE: 'https://ralgranot-dotcom.github.io/my-album/'
};

/* ---------- עזרים ---------- */
A.openExternal = url => { if (A.native.has()) location.href = url; else window.open(url, '_blank', 'noopener'); };
A.copyText = async txt => {
  try { await navigator.clipboard.writeText(txt); A.toast('📋 הועתק'); return; } catch (e) { /* חלופה */ }
  const t = A.h('textarea', { style: 'position:fixed;opacity:0' }); t.value = txt; document.body.appendChild(t); t.select();
  try { document.execCommand('copy'); A.toast('📋 הועתק'); } catch (e) { A.alert('העתקה', txt); }
  t.remove();
};
A.qrImage = text => {
  const d = A.native.call('qrMake', text, 640);
  return d ? A.h('img', { src: d, alt: 'קוד QR', style: 'width:220px;height:220px;display:block;margin:8px auto;background:#fff;border-radius:8px' }) : null;
};
A.nativeAsync = (method, ...args) => new Promise((res, rej) => {
  const id = A.native.cb((ok, v) => ok ? res(v) : rej(new Error(v || 'הפעולה נכשלה')));
  A.native.call(method, id, ...args);
});
/* התמונה הטובה ביותר (ערוכה אם יש) כ-JPEG בגודל מוגבל */
A.photoJpeg = async (p, maxDim, q) => {
  const b = (p.hasEdit && await A.db.blob(p.id + ':edit')) || await A.db.blob(p.id + ':orig') || await A.db.blob(p.id + ':disp');
  if (!b) throw new Error('קובץ התמונה חסר');
  const src = await A.decode(b, maxDim);
  const c = A.canvas(src.width, src.height); const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0);
  return A.canvasToBlob(c, 'image/jpeg', q || 0.9);
};
A.loadUrlImage = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('טעינת התוצאה נכשלה')); i.src = url; });

/* ================= כלים חכמים במכשיר ================= */
A.aiTools = {
  ok() {
    if (A.native.has() && A.native.call('aiAvailable')) return true;
    A.alert('🤖 כלים חכמים', 'הכלים החכמים (הסרת רקע, צביעה וזיהוי תוכן) פועלים באפליקציית האנדרואיד, במכשיר עצמו. בגרסת הדפדפן לאייפון הם עדיין אינם זמינים.');
    return false;
  },
  menu(ph) {
    if (!this.ok()) return;
    const items = [
      ['✂️', 'הסרת רקע (רקע שקוף)', () => this.background(ph, 'cut')],
      ['⬜', 'החלפת רקע בצבע אחיד', () => this.background(ph, 'color')],
      ['🌫️', 'טשטוש רקע (מראה פורטרט)', () => this.background(ph, 'blur')],
      ['🎨', 'צביעת תמונה בשחור־לבן', () => this.colorize(ph)],
      ['🏷️', 'זיהוי מה רואים בתמונה ותיוג', () => this.label([ph.id], true)]
    ];
    const box = A.h('div.list'); let close;
    items.forEach(([i, l, f]) => box.appendChild(A.h('button.list-item', { type: 'button', onclick: () => { close(); f(); } }, i + ' ' + l)));
    box.appendChild(A.h('p.muted', null, 'התוצאה נשמרת כתמונה חדשה בספרייה. המקור אינו משתנה.'));
    A.modal('🤖 כלים חכמים', box, [{ label: 'סגירה', value: null }], { onOpen: (c, cl) => { close = cl; } });
  },
  async pickOne(title) { const ids = await A.pickPhotos({ title }); return ids.length ? A.db.photo(ids[0]) : null; },
  async bgFlow() { if (!this.ok()) return; const p = await this.pickOne('בחרו תמונה להסרת / טשטוש רקע'); if (!p) return; const m = await A.modal('✂️ מה לעשות ברקע?', A.h('p', null, 'הזיהוי מתבצע במכשיר.'), [{ label: 'הסרה', value: 'cut' }, { label: 'צבע אחיד', value: 'color' }, { label: 'טשטוש', value: 'blur', cls: 'primary' }]); if (m) this.background(p, m); },
  async colorFlow() { if (!this.ok()) return; const p = await this.pickOne('בחרו תמונה בשחור־לבן לצביעה'); if (p) this.colorize(p); },
  async labelFlow() { if (!this.ok()) return; const ids = await A.pickPhotos({ multi: true, title: 'בחרו תמונות לזיהוי תוכן' }); if (ids.length) this.label(ids, false); },

  async background(ph, mode) {
    let color = '#ffffff';
    if (mode === 'color') {
      const inp = A.h('input', { type: 'color', value: '#ffffff', style: 'width:100%;height:56px' });
      const v = await A.modal('צבע הרקע החדש', inp, [{ label: 'ביטול', value: null }, { label: 'המשך', cls: 'primary', value: () => inp.value }]);
      if (!v) return; color = v;
    }
    const pr = A.progress('מזהה את הנושא בתמונה…'); pr.set(0.3);
    try {
      const jpg = await A.photoJpeg(ph, 2000, 0.92);
      const path = await A.nativeAsync('aiSegment', await A.blobToDataURL(jpg));
      pr.set(0.7, 'מרכיב את התמונה…');
      const fg = await A.loadUrlImage(path);
      const base = await A.decode(jpg);
      const c = A.canvas(fg.naturalWidth, fg.naturalHeight); const g = c.getContext('2d');
      if (mode === 'color') { g.fillStyle = color; g.fillRect(0, 0, c.width, c.height); }
      if (mode === 'blur') { g.filter = 'blur(' + Math.max(6, Math.round(c.width / 90)) + 'px)'; g.drawImage(base, -20, -20, c.width + 40, c.height + 40); g.filter = 'none'; }
      g.drawImage(fg, 0, 0, c.width, c.height);
      const png = mode === 'cut';
      const blob = await A.canvasToBlob(c, png ? 'image/png' : 'image/jpeg', 0.93);
      const label = mode === 'cut' ? 'ללא רקע' : mode === 'blur' ? 'רקע מטושטש' : 'רקע חדש';
      const rec = await A.photos.addGenerated(blob, (ph.name || 'תמונה').replace(/\.\w+$/, '') + ' — ' + label + (png ? '.png' : '.jpg'));
      pr.done();
      this.done(rec, '✅ ' + label);
    } catch (e) { pr.done(); A.alert('הפעולה לא הושלמה', e.message); }
  },

  async ensureModel() {
    if (A.native.call('aiHasColorModel')) return true;
    const ok = await A.confirm('🎨 הורדת מודל הצביעה', 'בשימוש הראשון צריך להוריד את מודל הצביעה למכשיר (כ־130MB, פעם אחת בלבד). מומלץ להתחבר ל-Wi-Fi. להוריד עכשיו?', '⬇️ הורדה');
    if (!ok) return false;
    const pr = A.progress('מוריד את מודל הצביעה…');
    return new Promise(res => {
      const id = A.native.cb((st, v) => {
        if (st === 'progress') { pr.set(+v, Math.round(+v * 100) + '%'); return; }
        pr.done();
        if (st === 'ok') res(true); else { A.alert('ההורדה לא הושלמה', String(v || '')); res(false); }
      });
      A.native.call('aiDownloadColorModel', id);
    });
  },
  async colorize(ph) {
    if (!(await this.ensureModel())) return;
    const pr = A.progress('צובע את התמונה…'); pr.set(0.4);
    try {
      const jpg = await A.photoJpeg(ph, 2000, 0.93);
      const path = await A.nativeAsync('aiColorize', await A.blobToDataURL(jpg), 1.0);
      pr.set(0.85);
      const r = await fetch(path); const blob = await r.blob();
      const rec = await A.photos.addGenerated(blob, (ph.name || 'תמונה').replace(/\.\w+$/, '') + ' — צבועה.jpg');
      pr.done();
      this.done(rec, '✅ התמונה נצבעה');
    } catch (e) { pr.done(); A.alert('הצביעה לא הושלמה', e.message === 'nomodel' ? 'מודל הצביעה חסר. נסו שוב.' : e.message); }
  },
  async done(rec, msg) {
    if (!rec) return;
    const u = await A.cache.photoUrl(rec, 'disp');
    const r = await A.modal(msg, A.h('div', null, A.h('img.detail-img', { src: u, alt: '' }), A.h('p.muted', null, 'נשמרה כתמונה חדשה בספרייה.')),
      [{ label: 'סגירה', value: null }, { label: '✏️ עריכה', value: 'edit' }, { label: '📘 לאלבום', value: 'album', cls: 'primary' }], { wide: true });
    if (r === 'edit') A.router.go('photoEdit', { photoId: rec.id });
    if (r === 'album') A.addPhotosToAlbum([rec.id]);
    if (!r) A.router.refresh();
  },

  /* זיהוי תוכן: תגיות בעברית + כיתוב אם אין */
  HE: { Person: 'אדם', People: 'אנשים', Child: 'ילד', Baby: 'תינוק', Smile: 'חיוך', Selfie: 'סלפי', Beard: 'זקן', Dog: 'כלב', Cat: 'חתול', Bird: 'ציפור', Horse: 'סוס', Pet: 'חיית מחמד', Flower: 'פרח', Plant: 'צמח', Tree: 'עץ', Garden: 'גינה', Sky: 'שמיים', Cloud: 'עננים', Sunset: 'שקיעה', Beach: 'חוף', Sea: 'ים', Lake: 'אגם', River: 'נהר', Mountain: 'הר', Desert: 'מדבר', Snow: 'שלג', Food: 'אוכל', Cake: 'עוגה', Bread: 'לחם', Fruit: 'פרי', Vegetable: 'ירק', Car: 'מכונית', Bicycle: 'אופניים', Building: 'בניין', House: 'בית', Church: 'כנסייה', Bridge: 'גשר', Road: 'כביש', City: 'עיר', Party: 'מסיבה', Wedding: 'חתונה', Dress: 'שמלה', 'Musical instrument': 'כלי נגינה', Musician: 'נגן', Dance: 'ריקוד', Toy: 'צעצוע', Game: 'משחק', Sports: 'ספורט', Ball: 'כדור', Swimming: 'שחייה', Playground: 'גן שעשועים', Pool: 'בריכה', Book: 'ספר', Glasses: 'משקפיים', Hat: 'כובע', Jacket: 'מעיל', Shoe: 'נעל', Table: 'שולחן', Chair: 'כיסא', Couch: 'ספה', Room: 'חדר', Television: 'טלוויזיה', Computer: 'מחשב', Phone: 'טלפון', Christmas: 'חג', Fun: 'כיף', Crowd: 'קהל', Team: 'קבוצה', Event: 'אירוע', Vacation: 'חופשה', Camping: 'קמפינג', Bonfire: 'מדורה', Fire: 'אש', Candle: 'נר', Balloon: 'בלון', Flag: 'דגל', Statue: 'פסל', Museum: 'מוזיאון', Stadium: 'אצטדיון', Boat: 'סירה', Airplane: 'מטוס', Train: 'רכבת', Bus: 'אוטובוס', Waterfall: 'מפל', Forest: 'יער', Field: 'שדה', Grass: 'דשא', Rock: 'סלע', Moon: 'ירח', Star: 'כוכב', Night: 'לילה', Infrastructure: 'תשתית', Skyscraper: 'גורד שחקים', Wine: 'יין', Coffee: 'קפה', Pizza: 'פיצה', Hand: 'יד', Eyelash: 'ריסים', Tattoo: 'קעקוע', Cool: 'מגניב', Shorts: 'מכנסיים קצרים', Jeans: 'ג׳ינס', Bag: 'תיק', Umbrella: 'מטריה', Sunglasses: 'משקפי שמש', Surfing: 'גלישה', Skiing: 'סקי', Joker: 'ליצן', Comics: 'קומיקס', Bathroom: 'חדר אמבטיה', Kitchen: 'מטבח', Bedroom: 'חדר שינה', Shelf: 'מדף', Pier: 'מזח', Lighthouse: 'מגדלור', Wheel: 'גלגל', Pattern: 'דוגמה', Art: 'אמנות', Painting: 'ציור', Monument: 'אנדרטה', Ruins: 'חורבות', Temple: 'מקדש', Castle: 'טירה' },
  async label(ids, show) {
    if (!this.ok()) return;
    const pr = A.progress('מזהה את תוכן התמונות…');
    let n = 0, last = null;
    try {
      for (let i = 0; i < ids.length; i++) {
        if (pr.cancelled) break;
        pr.set(i / ids.length, (i + 1) + ' מתוך ' + ids.length);
        const p = await A.db.photo(ids[i]); if (!p) continue;
        const jpg = await A.photoJpeg(p, 900, 0.85);
        const arr = JSON.parse(await A.nativeAsync('aiLabels', await A.blobToDataURL(jpg), true));
        const he = arr.map(x => this.HE[x.en] || x.he || x.en).filter((v, k, a) => v && a.indexOf(v) === k);
        p.contentLabels = arr.map(x => x.en);
        p.tags = Array.from(new Set((p.tags || []).concat(he)));
        if (!p.caption && he.length) p.caption = 'בתמונה: ' + he.slice(0, 4).join(', ');
        await A.db.savePhoto(p); n++; last = { p, he };
      }
      pr.done();
      if (show && last) A.alert('🏷️ זוהה בתמונה', A.h('div', null, A.h('p', null, last.he.length ? last.he.join(' · ') : 'לא זוהה תוכן ברור'), A.h('p.muted', null, 'התגיות נוספו לתמונה, ואפשר לחפש לפיהן במסך החיפוש.')));
      else A.toast('✅ זוהה תוכן ב-' + n + ' תמונות. אפשר לחפש לפי מה שרואים בהן.', 4000);
    } catch (e) { pr.done(); A.alert('הזיהוי לא הושלם', e.message); }
  }
};

/* ================= ענן ================= */
A.cloud = {
  async call(op, body) {
    let r;
    try { r = await fetch(A.CLOUD.FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ op }, body || {})) }); }
    catch (e) { throw new Error('אין חיבור לאינטרנט'); }
    let j = {}; try { j = await r.json(); } catch (e) { /* */ }
    if (!r.ok || j.error) throw new Error(j.error === 'forbidden' ? 'הקוד אינו נכון' : j.error === 'not found' ? 'לא נמצא בענן (אולי נמחק)' : (j.error || 'שגיאת שרת ' + r.status));
    return j;
  },
  async put(url, blob, type) {
    for (let t = 0; t < 3; t++) {
      try { const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': type || blob.type || 'application/octet-stream', 'x-upsert': 'true' }, body: blob }); if (r.ok) return; if (r.status < 500) throw new Error('ההעלאה נדחתה (' + r.status + ')'); }
      catch (e) { if (t === 2) throw e; }
      await A.sleep(1500 * (t + 1));
    }
  },
  groups: s => s.toUpperCase().match(/.{1,5}/g).join('-'),
  clean: s => String(s || '').trim().replace(/^myalbum:(join|backup):/i, '').toLowerCase().replace(/[^a-f0-9]/g, ''),
  async readCode(title, hint) {
    const inp = A.h('input.inp', { type: 'text', dir: 'ltr', placeholder: hint, autocomplete: 'off' });
    const body = A.h('div.form', null, A.h('label.field', null, A.h('span', null, 'הקלידו או הדביקו את הקוד'), inp));
    if (A.native.has()) body.appendChild(A.h('button.btn', { type: 'button', onclick: async () => {
      const f = await A.pickFiles('image/*', false, 'environment'); if (!f.length) return;
      const src = await A.decode(f[0], 1600); const c = A.canvas(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0);
      const txt = A.native.call('qrRead', c.toDataURL('image/jpeg', 0.9));
      if (txt) { inp.value = txt; A.toast('✅ הקוד נסרק'); } else A.toast('לא זוהה קוד QR בתמונה — נסו לצלם קרוב וחד יותר', 4000);
    } }, '📷 סריקת קוד QR במצלמה'));
    const v = await A.modal(title, body, [{ label: 'ביטול', value: null }, { label: 'המשך', cls: 'primary', value: () => inp.value }]);
    return v ? this.clean(v) : null;
  },

  /* ---------- פרסום אלבום לצפייה (קישור + QR) ---------- */
  viewUrl: id => A.CLOUD.SITE + 'view.html#' + id,
  async publish(al) {
    if (!al.pages.length) return A.alert('האלבום ריק', 'הוסיפו עמודים לפני הפרסום.');
    const pub = al.pub;
    if (!pub) {
      const ok = await A.confirm('🌐 פרסום לצפייה בקישור', 'העמודים יועלו לענן כתמונות, וכל מי שיקבל את הקישור או יסרוק את קוד ה-QR יוכל לדפדף באלבום (כולל הסרטונים שבו). אפשר לבטל את הפרסום בכל עת. להמשיך?', 'פרסום');
      if (!ok) return;
    }
    const pr = A.progress('מכין את העמודים…');
    try {
      const rec = pub || await this.call('create', { kind: 'pub', title: al.name });
      const W = 1100, files = [];
      files.push(['cover.jpg', await A.canvasToBlob(await A.render.cover(al, W), 'image/jpeg', 0.85)]);
      const pages = [];
      for (let i = 0; i < al.pages.length; i++) {
        if (pr.cancelled) { pr.done(); return; }
        pr.set(i / al.pages.length * 0.4, 'עמוד ' + (i + 1) + ' מתוך ' + al.pages.length);
        files.push(['p' + (i + 1) + '.jpg', await A.canvasToBlob(await A.render.page(al, al.pages[i], W), 'image/jpeg', 0.85)]);
        const vids = [];
        for (const e of al.pages[i].elements) if (e.mediaId) {
          const m = await A.db.get('media', e.mediaId); const b = m && await A.db.blob(m.id + ':data');
          if (!b || b.size > 24 * 1048576) continue;
          const ext = (m.type === 'audio' ? 'm4a' : 'mp4'), nm = 'm' + (i + 1) + '_' + vids.length + '.' + ext;
          files.push([nm, b]); vids.push({ f: nm, t: m.type, n: m.name || '' });
        }
        pages.push({ v: vids });
      }
      files.push(['back.jpg', await A.canvasToBlob(await A.render.cover(al, W, true), 'image/jpeg', 0.85)]);
      files.push(['album.json', new Blob([JSON.stringify({ title: al.name, pages, ar: A.model.aspect(al), at: Date.now() })], { type: 'application/json' })]);
      pr.set(0.45, 'מעלה לענן…');
      const { urls } = await this.call('pub_urls', { id: rec.id, secret: rec.secret, names: files.map(f => f[0]) });
      for (let i = 0; i < files.length; i++) {
        if (pr.cancelled) break;
        pr.set(0.45 + 0.55 * i / files.length, 'מעלה ' + (i + 1) + ' מתוך ' + files.length);
        await this.put(urls[i], files[i][1], /\.json$/.test(files[i][0]) ? 'application/json' : null);
      }
      await this.call('pub_done', { id: rec.id, secret: rec.secret, title: al.name, pages: al.pages.length });
      al.pub = { id: rec.id, secret: rec.secret, at: Date.now() }; await A.db.saveAlbum(al);
      pr.done();
      this.showPub(al);
    } catch (e) { pr.done(); A.alert('הפרסום לא הושלם', e.message); }
  },
  async showPub(al) {
    const url = this.viewUrl(al.pub.id);
    const qr = A.qrImage(url);
    const r = await A.modal('🌐 האלבום מפורסם', A.h('div', null, qr, A.h('p', { dir: 'ltr', style: 'word-break:break-all;text-align:center;font-size:.85em' }, url),
      A.h('p.muted', null, 'עודכן: ' + A.fmtDate(al.pub.at, true) + '. אחרי שינויים באלבום לחצו "עדכון" כדי לפרסם מחדש.'),
      A.h('div.grid2', null,
        A.h('button.btn', { type: 'button', onclick: () => A.copyText(url) }, '📋 העתקת קישור'),
        A.h('button.btn', { type: 'button', onclick: () => A.openExternal('https://wa.me/?text=' + encodeURIComponent('📸 ' + al.name + '\n' + url)) }, '💬 וואטסאפ'),
        A.h('button.btn', { type: 'button', onclick: () => A.openExternal(url) }, '👀 צפייה'),
        A.h('button.btn', { type: 'button', onclick: () => this.qrToAlbum(al, url) }, '🔳 הוספת QR לאלבום'))),
    [{ label: 'סגירה', value: null }, { label: '🗑️ ביטול פרסום', value: 'del' }, { label: '🔄 עדכון', value: 'upd', cls: 'primary' }], { wide: true });
    if (r === 'upd') this.publish(al);
    if (r === 'del' && await A.confirm('ביטול פרסום', 'הקישור וקוד ה-QR יפסיקו לעבוד, והעמודים יימחקו מהענן.', 'ביטול פרסום', true)) {
      try { await this.call('delete', { kind: 'pub', id: al.pub.id, secret: al.pub.secret }); delete al.pub; await A.db.saveAlbum(al); A.toast('הפרסום בוטל'); } catch (e) { A.alert('הפעולה נכשלה', e.message); }
    }
  },
  /* קוד QR מודפס באלבום — מוביל לאלבום הדיגיטלי ולסרטונים */
  async qrToAlbum(al, url) {
    const d = A.native.call('qrMake', url, 1200);
    if (!d) return A.alert('QR', 'יצירת קוד QR זמינה באפליקציית האנדרואיד.');
    const blob = await (await fetch(d)).blob();
    const rec = await A.photos.addGenerated(blob, 'קוד QR — ' + al.name + '.png');
    const pg = A.model.newPage(al);
    const asp = A.model.aspect(al), h = 0.55, w = Math.min(0.8, h / asp);
    pg.elements.push({ id: A.uid(), type: 'photo', x: (1 - w) / 2, y: 0.16, w, h: w * asp, rot: 0, shape: 'rect', frame: 'none', photoId: rec.id, zoom: 1, ox: 0, oy: 0, z: 1 });
    pg.elements.push({ id: A.uid(), type: 'text', x: 0.08, y: 0.18 + w * asp, w: 0.84, h: 0.1, text: 'סרקו לצפייה באלבום הדיגיטלי ובסרטונים', size: 0.04, font: 'serif', color: '#333', align: 'center', rot: 0, z: 100 });
    al.pages.push(pg); if (al.pages.length % 2) al.pages.push(A.model.newPage(al));
    await A.db.saveAlbum(al); A.viewer.invalidate();
    A.toast('✅ נוסף עמוד עם קוד QR בסוף האלבום', 4000);
  },

  /* ---------- אלבום משפחתי משותף ---------- */
  myName() { return A.settings.get('shareName') || ''; },
  async askName() {
    let n = this.myName();
    if (n) return n;
    n = await A.prompt('👋 איך לקרוא לך?', 'השם שיופיע ליד התמונות שתוסיפו לאלבום המשותף', '');
    if (!n || !n.trim()) return null;
    A.settings.set('shareName', n.trim()); return n.trim();
  },
  inviteText(al) { return 'myalbum:join:' + al.share.id + ':' + al.share.key; },
  async shareMenu(al) {
    if (!al.share) {
      const r = await A.modal('👨‍👩‍👧 אלבום משפחתי משותף', A.h('div', null,
        A.h('p', null, 'כל מי שתזמינו יוכל להוסיף תמונות לאלבום מהטלפון שלו, ותמונות של כולם יופיעו אצל כולם בלחיצה על "סנכרון".'),
        A.h('p.muted', null, 'התמונות המשותפות נשמרות בענן מאובטח, והגישה אליהן רק עם קוד ההזמנה. כל אחד שומר עותק מלא במכשיר שלו.')),
        [{ label: 'ביטול', value: null }, { label: '✨ הפיכה לאלבום משותף', value: 'make', cls: 'primary' }]);
      if (r !== 'make' || !(await this.askName())) return;
      try {
        const rec = await this.call('create', { kind: 'share', title: al.name });
        al.share = { id: rec.id, key: rec.key, secret: rec.secret, role: 'owner', after: 0, up: {}, down: {} };
        await A.db.saveAlbum(al);
        await this.sync(al);
      } catch (e) { return A.alert('הפעולה נכשלה', e.message); }
    }
    const sh = al.share, inv = this.inviteText(al);
    const code = this.groups(sh.id + sh.key);
    const r = await A.modal('👨‍👩‍👧 ' + al.name, A.h('div', null,
      A.h('p', null, 'להזמנת בן משפחה: במכשיר שלו פותחים "האלבום שלי" ← הגדרות ← "הצטרפות לאלבום משותף", וסורקים את הקוד או מקלידים אותו:'),
      A.qrImage(inv), A.h('p', { dir: 'ltr', style: 'text-align:center;font-weight:800;letter-spacing:1px' }, code),
      A.h('div.grid2', null,
        A.h('button.btn', { type: 'button', onclick: () => A.copyText(code) }, '📋 העתקת קוד'),
        A.h('button.btn', { type: 'button', onclick: () => A.openExternal('https://wa.me/?text=' + encodeURIComponent('📸 הוזמנת לאלבום המשותף "' + al.name + '" באפליקציה "האלבום שלי".\nקוד הצטרפות: ' + code + '\nלהורדת האפליקציה: ' + A.CLOUD.SITE)) }, '💬 שליחה בוואטסאפ')),
      A.h('p.muted', null, 'סנכרון אחרון: ' + (sh.syncedAt ? A.fmtDate(sh.syncedAt, true) : 'עדיין לא'))),
      [{ label: 'סגירה', value: null }, { label: sh.role === 'owner' ? '🗑️ מחיקת השיתוף' : '🚪 יציאה מהשיתוף', value: 'leave' }, { label: '🔄 סנכרון עכשיו', value: 'sync', cls: 'primary' }], { wide: true });
    if (r === 'sync') this.sync(al);
    if (r === 'leave') {
      const owner = sh.role === 'owner';
      if (!(await A.confirm(owner ? 'מחיקת השיתוף' : 'יציאה מהשיתוף', owner ? 'התמונות המשותפות יימחקו מהענן, ובני המשפחה לא יוכלו לסנכרן יותר. העותק שבמכשיר שלך נשאר.' : 'האלבום יישאר במכשיר שלך, אך לא יסונכרן יותר.', 'אישור', true))) return;
      try { if (owner) await this.call('delete', { kind: 'share', id: sh.id, secret: sh.secret }); } catch (e) { if (!/לא נמצא/.test(e.message)) return A.alert('הפעולה נכשלה', e.message); }
      delete al.share; await A.db.saveAlbum(al); A.toast('השיתוף הופסק'); A.router.refresh();
    }
  },
  async join() {
    const v = await this.readCode('🤝 הצטרפות לאלבום משותף', 'XXXXX-XXXXX-…');
    if (!v) return;
    if (v.length !== 40) return A.alert('הקוד אינו תקין', 'קוד הצטרפות כולל 40 תווים (אותיות a–f וספרות). בדקו שהעתקתם אותו במלואו.');
    const id = v.slice(0, 20), key = v.slice(20);
    const exist = (await A.db.albums()).find(a => a.share && a.share.id === id);
    if (exist) { A.toast('האלבום כבר נמצא אצלך'); return this.sync(exist); }
    try {
      const info = await this.call('share_info', { id, key });
      if (!(await this.askName())) return;
      const al = A.model.newAlbum({ name: info.title || 'אלבום משותף', pageCount: 0 });
      al.pages = [];
      al.share = { id, key, role: 'member', after: 0, up: {}, down: {} };
      await A.db.saveAlbum(al);
      await this.sync(al);
      A.router.go('viewer', { albumId: al.id, autoOpen: true });
    } catch (e) { A.alert('ההצטרפות נכשלה', e.message); }
  },
  async sync(al) {
    const sh = al.share; if (!sh) return;
    sh.up = sh.up || {}; sh.down = sh.down || {};
    const pr = A.progress('מסנכרן את האלבום המשותף…');
    const auth = { id: sh.id, key: sh.key, secret: sh.secret };
    let sent = 0, got = 0;
    try {
      /* 1. העלאת תמונות חדשות שלי */
      const fromCloud = new Set(Object.values(sh.down));
      const mine = Array.from(A.model.photoIds(al)).filter(pid => !sh.up[pid] && !fromCloud.has(pid));
      for (let i = 0; i < mine.length; i++) {
        if (pr.cancelled) break;
        pr.set(0.5 * i / Math.max(1, mine.length), 'מעלה ' + (i + 1) + ' מתוך ' + mine.length);
        const p = await A.db.photo(mine[i]); if (!p) continue;
        const jpg = await A.photoJpeg(p, 2048, 0.88);
        const r = await this.call('share_add', Object.assign({ author: this.myName(), caption: p.caption || '', w: p.w, h: p.h, taken_at: p.takenAt || p.fileDate || 0 }, auth));
        await this.put(r.url, jpg, 'image/jpeg');
        sh.up[p.id] = r.item; sent++;
        await A.db.saveAlbum(al);
      }
      /* 2. הורדת תמונות של אחרים */
      const myItems = new Set(Object.values(sh.up).map(Number));
      const fresh = [];
      for (let guard = 0; guard < 40; guard++) {
        const res = await this.call('share_list', Object.assign({ after: sh.after || 0 }, auth));
        if (res.title && sh.role !== 'owner' && res.title !== al.name) al.name = res.title;
        if (!res.items.length) break;
        for (const it of res.items) {
          sh.after = Math.max(sh.after || 0, it.id);
          if (myItems.has(it.id) || sh.down[it.id] || !it.url) continue;
          pr.set(0.5 + 0.4 * Math.min(1, fresh.length / 50), 'מוריד תמונה מ' + (it.author || 'בן משפחה'));
          try {
            const b = await (await fetch(it.url)).blob();
            const f = new File([b], 'משותף_' + it.id + '.jpg', { type: 'image/jpeg', lastModified: it.taken_at || Date.now() });
            const recs = await A.photos.importFiles([f], { progress: false });
            if (!recs[0]) continue;
            const p = recs[0];
            if (it.caption) p.caption = it.caption;
            p.tags = (p.tags || []).concat(it.author ? ['מאת ' + it.author] : []);
            if (it.taken_at && !p.takenAt) p.takenAt = it.taken_at;
            await A.db.savePhoto(p);
            sh.down[it.id] = p.id; fresh.push(p); got++;
          } catch (e) { console.warn(e); }
        }
        await A.db.saveAlbum(al);
        if (res.items.length < 200) break;
      }
      /* 3. סידור התמונות החדשות בעמודים */
      if (fresh.length) {
        const pages = A.ai.layoutPages(fresh.sort((a, b) => A.photos.date(a) - A.photos.date(b)));
        if (al.pages.every(pg => !pg.elements.length && !pg.bgPhotoId)) al.pages = [];
        al.pages = al.pages.concat(pages);
        if (al.pages.length % 2) al.pages.push(A.model.newPage(al));
        if (!al.coverPhotoId) al.coverPhotoId = fresh[0].id;
      }
      if (!al.pages.length) al.pages = [A.model.newPage(al), A.model.newPage(al)];
      sh.syncedAt = Date.now();
      await A.db.saveAlbum(al); A.viewer.invalidate();
      pr.done();
      A.toast('🔄 סנכרון הושלם: ' + sent + ' תמונות נשלחו, ' + got + ' התקבלו', 4000);
      A.router.refresh();
    } catch (e) { pr.done(); await A.db.saveAlbum(al); A.alert('הסנכרון לא הושלם', e.message + (sent + got ? '\n(' + sent + ' נשלחו, ' + got + ' התקבלו לפני התקלה — אפשר להמשיך בסנכרון נוסף)' : '')); }
  },

  /* ---------- גיבוי לענן ---------- */
  CH: 16 * 1048576,
  async backupUp() {
    const p1 = A.h('input.inp', { type: 'password', autocomplete: 'new-password' }), p2 = A.h('input.inp', { type: 'password', autocomplete: 'new-password' });
    const pass = await A.modal('☁️ גיבוי לענן', A.h('div.form', null,
      A.h('p', null, 'הגיבוי מוצפן במכשיר בסיסמה שלכם לפני ההעלאה — גם בענן אף אחד לא יכול לראות את התמונות.'),
      A.h('label.field', null, A.h('span', null, 'סיסמת הגיבוי (לפחות 6 תווים)'), p1), A.h('label.field', null, A.h('span', null, 'אימות סיסמה'), p2),
      A.h('p.muted', null, '⚠️ בלי הסיסמה וקוד השחזור לא ניתן לשחזר. שמרו את שניהם.')),
      [{ label: 'ביטול', value: null }, { label: 'גיבוי', cls: 'primary', value: () => p1.value, validate: () => { if (p1.value.length < 6) { A.toast('הסיסמה קצרה מדי'); return false; } if (p1.value !== p2.value) { A.toast('הסיסמאות אינן תואמות'); return false; } return true; } }]);
    if (!pass) return;
    let rec = null;
    try { rec = JSON.parse(localStorage.getItem('cloudBackup') || 'null'); } catch (e) { /* */ }
    try {
      if (!rec) { rec = await this.call('create', { kind: 'backup' }); rec = { id: rec.id, secret: rec.secret }; localStorage.setItem('cloudBackup', JSON.stringify(rec)); }
      const self = this, parts = []; let buffered = 0, n = 0;
      const flush = async () => { if (!buffered) return; const blob = new Blob(parts.splice(0)); buffered = 0; const { url } = await self.call('backup_put', { id: rec.id, secret: rec.secret, n }); await self.put(url, blob, 'application/octet-stream'); n++; };
      const sink = {
        size: 0,
        async write(u8) { parts.push(u8.slice ? u8.slice() : u8); buffered += u8.byteLength || u8.size || 0; this.size += u8.byteLength || u8.size || 0; if (buffered >= self.CH) await flush(); },
        async close() { await flush(); await self.call('backup_done', { id: rec.id, secret: rec.secret, chunks: n, size: this.size, name: 'גיבוי ' + A.fmtDate(Date.now(), true) }); return 'הענן של האלבום שלי'; },
        abort() { parts.length = 0; }
      };
      const r = await A.backup.create({ password: pass, sink });
      if (!r) return;
      localStorage.setItem('lastCloudBackup', String(Date.now()));
      this.showBackupCode(rec, r.size);
    } catch (e) {
      if (/לא נמצא/.test(e.message)) localStorage.removeItem('cloudBackup');
      A.alert('הגיבוי לענן לא הושלם', e.message);
    }
  },
  showBackupCode(rec, size) {
    const code = this.groups(rec.id + rec.secret);
    return A.alert('✅ הגיבוי נשמר בענן', A.h('div', null,
      size ? A.h('p', null, 'גודל: ' + A.fmtBytes(size)) : null,
      A.h('p', null, 'קוד השחזור שלכם (שמרו אותו יחד עם הסיסמה):'),
      A.h('p', { dir: 'ltr', style: 'text-align:center;font-weight:800;letter-spacing:1px;word-break:break-all' }, code),
      A.qrImage('myalbum:backup:' + rec.id + rec.secret),
      A.h('button.btn', { type: 'button', onclick: () => A.copyText(code) }, '📋 העתקת הקוד'),
      A.h('p.muted', null, 'כל גיבוי חדש מהמכשיר הזה מחליף את הקודם באותו קוד.')));
  },
  async backupDown() {
    const v = await this.readCode('☁️ שחזור מהענן', 'קוד השחזור');
    if (!v) return;
    if (v.length !== 52) return A.alert('הקוד אינו תקין', 'קוד שחזור כולל 52 תווים. בדקו שהעתקתם אותו במלואו.');
    const rec = { id: v.slice(0, 20), secret: v.slice(20) };
    const pr = A.progress('מוריד את הגיבוי מהענן…');
    try {
      const g = await this.call('backup_get', rec);
      const parts = [];
      for (let i = 0; i < g.urls.length; i++) {
        if (pr.cancelled) { pr.done(); return; }
        pr.set(i / g.urls.length, 'חלק ' + (i + 1) + ' מתוך ' + g.urls.length + (g.meta.size ? ' · ' + A.fmtBytes(g.meta.size) : ''));
        const r = await fetch(g.urls[i]); if (!r.ok) throw new Error('הורדת חלק ' + (i + 1) + ' נכשלה');
        parts.push(new Blob([await r.arrayBuffer()]));
      }
      pr.done();
      const file = new File(parts, 'גיבוי_מהענן.myalbum', { type: 'application/octet-stream' });
      if (!localStorage.getItem('cloudBackup')) localStorage.setItem('cloudBackup', JSON.stringify(rec));
      await A.backup.restore(file);
    } catch (e) { pr.done(); A.alert('השחזור מהענן לא הושלם', e.message); }
  },
  async forgetBackup() {
    let rec = null; try { rec = JSON.parse(localStorage.getItem('cloudBackup') || 'null'); } catch (e) { /* */ }
    if (!rec) return A.toast('אין גיבוי בענן מהמכשיר הזה');
    if (!(await A.confirm('מחיקת הגיבוי מהענן', 'הגיבוי יימחק מהענן לצמיתות. הגיבויים שבמכשיר אינם מושפעים.', 'מחיקה', true))) return;
    try { await this.call('delete', Object.assign({ kind: 'backup' }, rec)); } catch (e) { if (!/לא נמצא/.test(e.message)) return A.alert('המחיקה נכשלה', e.message); }
    localStorage.removeItem('cloudBackup'); localStorage.removeItem('lastCloudBackup'); A.toast('הגיבוי נמחק מהענן'); A.router.refresh();
  }
};
