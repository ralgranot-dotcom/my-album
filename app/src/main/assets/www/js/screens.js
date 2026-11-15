/* האלבום שלי — מסכי ניהול: יצירת אלבום, ספריית תמונות, חיפוש, הגדרות */
'use strict';

/* ---------- בוחר תמונות (מהספרייה או מהמכשיר) ---------- */
A.pickPhotos = function (opts) {
  opts = opts || {};
  return new Promise(async resolve => {
    const chosen = new Set();
    const grid = A.h('div.pgrid.small');
    const count = A.h('span.muted', null, '');
    let close;
    async function fill() {
      grid.innerHTML = '';
      const all = (await A.db.photos()).filter(p => p.kind !== 'signature' || opts.signatures).sort((a, b) => b.addedAt - a.addedAt);
      if (!all.length) grid.appendChild(A.h('p.muted', null, 'אין עדיין תמונות בספרייה. הוסיפו מהמכשיר.'));
      for (const p of all) {
        const im = A.h('img', { alt: p.caption || p.name, loading: 'lazy' });
        A.cache.photoUrl(p, 'thumb').then(u => { if (u) im.src = u; });
        const cell = A.h('button.pcell', { type: 'button', onclick: () => {
          if (!opts.multi) { close(); resolve([p.id]); return; }
          if (chosen.has(p.id)) chosen.delete(p.id); else chosen.add(p.id);
          cell.classList.toggle('sel', chosen.has(p.id)); count.textContent = chosen.size ? 'נבחרו ' + chosen.size : '';
        } }, im);
        grid.appendChild(cell);
      }
    }
    const addBtn = A.h('button.btn', { type: 'button', onclick: async () => {
      const files = await A.pickFiles('image/*', true);
      const recs = await A.photos.importFiles(files);
      if (!opts.multi && recs.length) { close(); resolve([recs[0].id]); return; }
      recs.forEach(r => chosen.add(r.id));
      await fill();
      A.$$('.pcell', grid).forEach(() => {});
      count.textContent = chosen.size ? 'נבחרו ' + chosen.size + ' (כולל החדשות)' : '';
    } }, '📱 הוספה מהמכשיר');
    const body = A.h('div', null, A.h('div.row', null, addBtn, count), grid);
    await fill();
    const res = await A.modal(opts.title || 'בחירת תמונות', body, opts.multi ? [{ label: 'ביטול', value: null }, { label: 'אישור', value: 'ok', cls: 'primary' }] : [{ label: 'ביטול', value: null }], { wide: true, onOpen: (c, cl) => { close = cl; } });
    if (res === 'ok') resolve(Array.from(chosen));
    else if (res === null) resolve([]);
  });
};

/* ================= יצירה / עריכת פרטי אלבום ================= */
A.screens.albumForm = async function (p) {
  const editing = !!p.albumId;
  const al = editing ? await A.db.album(p.albumId) : A.model.newAlbum(Object.assign({ name: '' }, p.preset || {}));
  if (!al) throw new Error('האלבום לא נמצא');
  const s = A.h('div.screen');
  s.appendChild(A.header(editing ? 'פרטי האלבום' : 'יצירת אלבום חדש'));
  const preview = A.h('canvas.cover-prev');
  const f = A.h('form.form', { onsubmit: e => e.preventDefault() });
  const draw = async () => { const c = await A.render.cover(al, 400); preview.width = c.width; preview.height = c.height; preview.getContext('2d').drawImage(c, 0, 0); };
  const inp = (label, key, type, extra) => {
    const i = A.h(type === 'textarea' ? 'textarea.inp' : 'input.inp', Object.assign({ type: type === 'textarea' ? undefined : type || 'text', value: al[key] == null ? '' : al[key] }, extra || {}));
    if (type === 'textarea') i.value = al[key] || '';
    i.addEventListener('input', () => { al[key] = type === 'number' ? +i.value : i.value; if (key === 'name' || key === 'title') draw(); });
    return A.h('label.field', null, A.h('span', null, label), i);
  };
  const select = (label, key, map) => {
    const se = A.h('select.inp', { onchange: e => { al[key] = e.target.value; draw(); } }, Object.entries(map).map(([v, l]) => A.h('option', { value: v, selected: al[key] === v }, l)));
    return A.h('label.field', null, A.h('span', null, label), se);
  };
  const colors = A.h('div.swatches', null, A.model.COLORS.map(c => {
    const b = A.h('button.sw', { type: 'button', 'aria-label': 'צבע ' + c, style: { background: c }, onclick: () => { al.coverColor = c; A.$$('.sw', colors).forEach(x => x.classList.toggle('on', x === b)); draw(); } });
    if (c === al.coverColor) b.classList.add('on');
    return b;
  }), A.h('label.sw.custom', { title: 'צבע אחר' }, '🎨', A.h('input', { type: 'color', value: al.coverColor, oninput: e => { al.coverColor = e.target.value; draw(); } })));
  const catMap = {}; A.model.CATS.forEach(c => { catMap[c] = c; });
  const coverPick = A.h('button.btn', { type: 'button', onclick: async () => { const ids = await A.pickPhotos({ title: 'בחירת תמונת כריכה' }); if (ids.length) { al.coverPhotoId = ids[0]; draw(); } } }, '🖼️ בחירת תמונת כריכה');
  const bgPick = A.h('button.btn', { type: 'button', onclick: async () => { const ids = await A.pickPhotos({ title: 'תמונת רקע לכל הדפים' }); al.bgPhotoId = ids[0] || null; A.toast(al.bgPhotoId ? 'נקבעה תמונת רקע עדינה לדפים' : 'ללא תמונת רקע'); } }, '🌄 תמונת רקע לדפים');
  const musicPick = A.h('button.btn', { type: 'button', onclick: async () => {
    const files = await A.pickFiles('audio/*', false);
    if (!files.length) return;
    const m = await A.media.add(files[0], 'audio', files[0].name);
    al.musicId = m.id; A.toast('🎵 נבחרה מוזיקת רקע: ' + m.name);
  } }, '🎵 מוזיקת רקע');
  const dateInp = A.h('input.inp', { type: 'date', value: new Date(al.createdAt).toISOString().slice(0, 10), onchange: e => { const t = Date.parse(e.target.value); if (!isNaN(t)) al.createdAt = t; } });
  f.append(
    A.h('div.cover-prev-wrap', null, preview),
    inp('שם האלבום', 'name', 'text', { required: true, placeholder: 'למשל: חתונת דני ומיכל' }),
    A.h('label.field', null, A.h('span', null, 'תאריך'), dateInp),
    inp('כותרת על הכריכה (אם שונה מהשם)', 'title'),
    select('קטגוריה', 'category', catMap),
    A.h('div.field', null, A.h('span', null, 'צבע הכריכה'), colors),
    select('סוג הכריכה', 'coverType', A.model.COVERS),
    select('גודל האלבום', 'size', A.model.SIZES),
    select('סגנון הדפים', 'pageStyle', A.model.PAPER),
    select('גימור הדפים', 'finish', A.model.FINISH),
    editing ? null : A.h('label.field', null, A.h('span', null, 'מספר עמודים'), A.h('input.inp#pc', { type: 'number', min: 2, max: 200, value: al.pages.length })),
    inp('הקדשה מיוחדת (תופיע בעמוד הפתיחה)', 'dedication', 'textarea', { rows: 3 }),
    A.h('div.row.wrap', null, coverPick, bgPick, musicPick)
  );
  s.appendChild(f);
  s.appendChild(A.h('div.bottom-bar', null, A.h('button.btn.primary.big', { type: 'button', onclick: save }, editing ? '💾 שמירה' : '✨ יצירת האלבום')));
  draw();
  return s;

  async function save() {
    al.name = (al.name || '').trim();
    if (!al.name) return A.alert('חסר שם', 'יש לתת שם לאלבום.');
    if (!editing) {
      const n = A.clamp(+(A.$('#pc', f).value) || 20, 2, 200);
      const want = n % 2 ? n + 1 : n;
      while (al.pages.length < want) al.pages.push(A.model.newPage(al));
      if (al.pages.length > want) al.pages.length = want;
      if (al.dedication) {
        const tpl = A.render.TEMPLATES.find(t => t.id === 'title');
        A.render.applyTemplate(al.pages[0], tpl, []);
        const texts = al.pages[0].elements.filter(e => e.type === 'text');
        texts[0].text = al.title || al.name; texts[1].text = al.dedication;
      }
    } else {
      const fp = al.pages[0];
      if (fp && fp.template === 'title') { const texts = fp.elements.filter(e => e.type === 'text'); if (texts[1] && al.dedication) texts[1].text = al.dedication; fp.v = (fp.v || 0) + 1; }
    }
    await A.db.saveAlbum(al);
    A.viewer.invalidate();
    A.toast(editing ? 'נשמר' : 'האלבום נוצר! עכשיו נוסיף תמונות');
    if (editing) A.router.back();
    else A.router.go('editor', { albumId: al.id, page: 0 }, true);
  }
};

/* ================= ספריית התמונות ================= */
A.screens.library = async function (p) {
  const s = A.h('div.screen');
  const selected = new Set();
  let filter = 'all', q = '';
  const actions = A.h('div.sel-bar.hidden');
  s.appendChild(A.header(p.pickToEdit ? 'בחרו תמונה לעריכה' : 'ספריית התמונות'));
  const addRow = A.h('div.row.wrap', null,
    A.h('button.btn.primary', { type: 'button', onclick: async () => { const r = await A.photos.importFiles(await A.pickFiles('image/*', true)); if (r.length) { A.toast('נוספו ' + r.length + ' תמונות'); fill(); } } }, '📱 הוספת תמונות מהמכשיר'),
    A.h('button.btn', { type: 'button', onclick: async () => { const r = await A.photos.importFiles(await A.pickFiles('image/*', false, true)); if (r.length) fill(); } }, '📷 צילום'),
    A.h('button.btn', { type: 'button', onclick: () => A.scan.start() }, '🗂️ סריקת תמונה מודפסת'));
  const filters = A.h('div.row.wrap', null,
    A.h('select.sel', { onchange: e => { filter = e.target.value; fill(); }, 'aria-label': 'סינון' },
      A.h('option', { value: 'all' }, 'כל התמונות'), A.h('option', { value: 'unused' }, 'לא בשימוש באלבומים'), A.h('option', { value: 'edited' }, 'תמונות ערוכות'), A.h('option', { value: 'best' }, 'האיכותיות ביותר')),
    A.h('input.inp.search', { type: 'search', placeholder: '🔍 חיפוש לפי כיתוב או שם', oninput: e => { q = e.target.value.trim(); fill(); } }));
  const grid = A.h('div.pgrid');
  const stat = A.h('p.muted');
  s.append(addRow, filters, stat, grid, actions);
  await fill();
  return s;

  async function fill() {
    let all = await A.db.photos();
    const albums = await A.db.albums();
    const used = new Set(); albums.forEach(a => A.model.photoIds(a).forEach(i => used.add(i)));
    if (filter === 'unused') all = all.filter(x => !used.has(x.id));
    if (filter === 'edited') all = all.filter(x => x.hasEdit);
    if (q) all = all.filter(x => (x.caption || '').includes(q) || (x.name || '').includes(q) || (x.tags || []).some(t => t.includes(q)));
    if (filter === 'best') all.sort((a, b) => (b.quality || 0) - (a.quality || 0));
    else all.sort((a, b) => A.photos.date(b) - A.photos.date(a));
    stat.textContent = all.length + ' תמונות' + (filter === 'best' ? ' · ממוינות לפי חדות, תאורה ורזולוציה' : '');
    grid.innerHTML = '';
    if (!all.length) grid.appendChild(A.h('div.empty', null, A.h('div.big', null, '🖼️'), A.h('p', null, 'אין תמונות להצגה')));
    for (const ph of all) {
      const im = A.h('img', { alt: ph.caption || ph.name, loading: 'lazy' });
      A.cache.photoUrl(ph, 'thumb').then(u => { if (u) im.src = u; });
      const cell = A.h('button.pcell', { type: 'button' }, im, ph.hasEdit ? A.h('span.badge', null, '✏️') : null, filter === 'best' ? A.h('span.badge.q', null, ph.quality || 0) : null);
      if (selected.has(ph.id)) cell.classList.add('sel');
      let t = null, long = false;
      cell.addEventListener('pointerdown', () => { long = false; t = setTimeout(() => { long = true; toggle(ph.id, cell); }, 450); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => cell.addEventListener(ev, () => clearTimeout(t)));
      cell.addEventListener('contextmenu', e => e.preventDefault());
      cell.addEventListener('click', () => {
        if (long) return;
        if (selected.size) return toggle(ph.id, cell);
        if (p.pickToEdit) return A.router.go('photoEdit', { photoId: ph.id });
        A.photoDetail(ph);
      });
      grid.appendChild(cell);
    }
    renderActions();
  }
  function toggle(id, cell) { if (selected.has(id)) selected.delete(id); else selected.add(id); cell.classList.toggle('sel', selected.has(id)); renderActions(); }
  function renderActions() {
    actions.innerHTML = '';
    actions.classList.toggle('hidden', !selected.size);
    if (!selected.size) return;
    const ids = Array.from(selected);
    actions.append(
      A.h('span.cnt', null, 'נבחרו ' + ids.length),
      A.h('button.btn', { type: 'button', onclick: async () => { await A.addPhotosToAlbum(ids); selected.clear(); fill(); } }, '📘 לאלבום'),
      A.h('button.btn', { type: 'button', onclick: async () => { if (ids.length < 2) return A.toast('בחרו לפחות 2 תמונות לקולאז׳'); await A.makeCollage(ids); selected.clear(); fill(); } }, '🧩 קולאז׳'),
      A.h('button.btn', { type: 'button', onclick: async () => { await A.ai.duplicatesUI(ids); fill(); } }, '👯 כפילויות'),
      A.h('button.btn.danger', { type: 'button', onclick: async () => {
        if (!(await A.confirm('מחיקה לצמיתות', 'למחוק לצמיתות ' + ids.length + ' תמונות מהמכשיר ומכל האלבומים? לא ניתן לשחזר (אלא מגיבוי).', 'מחיקה לצמיתות', true))) return;
        await A.removePhotosEverywhere(ids);
        for (const id of ids) await A.db.deletePhoto(id);
        selected.clear(); A.toast('נמחק'); fill();
      } }, '🗑️'),
      A.h('button.btn', { type: 'button', onclick: () => { selected.clear(); fill(); } }, '✕'));
  }
};

A.removePhotosEverywhere = async function (ids) {
  const set = new Set(ids);
  for (const al of await A.db.albums()) {
    let ch = false;
    al.pages.forEach(pg => { pg.elements.forEach(e => { if (e.photoId && set.has(e.photoId)) { e.photoId = null; ch = true; pg.v = (pg.v || 0) + 1; } }); if (pg.bgPhotoId && set.has(pg.bgPhotoId)) { pg.bgPhotoId = null; ch = true; } });
    if (al.coverPhotoId && set.has(al.coverPhotoId)) { al.coverPhotoId = null; ch = true; }
    if (al.bgPhotoId && set.has(al.bgPhotoId)) { al.bgPhotoId = null; ch = true; }
    if (ch) await A.db.saveAlbum(al);
  }
  A.viewer.invalidate();
};

/* הוספת תמונות לאלבום: ממלאת מקומות ריקים ואחר כך עמודים חדשים בעיצוב אוטומטי */
A.addPhotosToAlbum = async function (ids, albumId) {
  let al = albumId ? await A.db.album(albumId) : null;
  if (!al) {
    al = await new Promise(res => A.chooseAlbum('לאיזה אלבום להוסיף?', res));
    if (!al) return;
  }
  if (!(await A.security.unlockAlbum(al))) return;
  const photos = (await Promise.all(ids.map(id => A.db.photo(id)))).filter(Boolean).sort((a, b) => A.photos.date(a) - A.photos.date(b));
  const queue = photos.map(p => p.id);
  /* מילוי מסגרות ריקות קיימות */
  for (const pg of al.pages) for (const e of pg.elements) if (e.type === 'photo' && !e.photoId && queue.length) { e.photoId = queue.shift(); pg.v = (pg.v || 0) + 1; }
  /* עמודים ריקים */
  const byId = Object.fromEntries(photos.map(p => [p.id, p]));
  for (const pg of al.pages) {
    if (!queue.length) break;
    if (pg.elements.length) continue;
    const n = Math.min(queue.length, [1, 2, 3, 4][Math.floor(Math.random() * 4)]);
    const take = queue.splice(0, n);
    A.render.applyTemplate(pg, A.render.autoTemplate(take.map(i => byId[i])), take);
    pg.v = (pg.v || 0) + 1;
  }
  while (queue.length) {
    const pg = A.model.newPage(al);
    const n = Math.min(queue.length, [1, 2, 3, 4][Math.floor(Math.random() * 4)]);
    const take = queue.splice(0, n);
    A.render.applyTemplate(pg, A.render.autoTemplate(take.map(i => byId[i])), take);
    al.pages.push(pg);
  }
  if (al.pages.length % 2) al.pages.push(A.model.newPage(al));
  if (!al.coverPhotoId && photos[0]) al.coverPhotoId = photos[0].id;
  await A.db.saveAlbum(al);
  A.viewer.invalidate();
  A.toast('✅ ' + photos.length + ' תמונות נוספו ל"' + al.name + '"');
  return al;
};

/* פרטי תמונה */
A.photoDetail = async function (ph) {
  const u = await A.cache.photoUrl(ph, 'disp');
  const cap = A.h('textarea.inp', { rows: 2, placeholder: 'כיתוב לתמונה' }); cap.value = ph.caption || '';
  const tags = A.h('input.inp', { type: 'text', value: (ph.tags || []).join(', '), placeholder: 'מילות מפתח, מופרדות בפסיק' });
  const info = [
    ph.takenAt ? 'צולמה: ' + A.fmtDate(ph.takenAt, true) : 'תאריך קובץ: ' + A.fmtDate(ph.fileDate),
    'רזולוציה: ' + ph.w + '×' + ph.h + ' (' + A.fmtBytes(ph.size) + ')',
    'ציון איכות: ' + (ph.quality || 0) + '/100',
    ph.gps ? 'מיקום: ' + ph.gps.lat.toFixed(4) + ', ' + ph.gps.lon.toFixed(4) : null
  ].filter(Boolean);
  const body = A.h('div', null, A.h('img.detail-img', { src: u, alt: '' }), A.h('ul.info', null, info.map(t => A.h('li', null, t))),
    A.h('label.field', null, A.h('span', null, 'כיתוב'), cap), A.h('label.field', null, A.h('span', null, 'מילות מפתח'), tags));
  const r = await A.modal('פרטי תמונה', body, [
    { label: '✏️ עריכה', value: 'edit' }, { label: '📘 לאלבום', value: 'album' }, { label: '💾 שמירה', value: 'save', cls: 'primary' }
  ], { wide: true });
  if (r) { ph.caption = cap.value.trim(); ph.tags = tags.value.split(/[,،]/).map(x => x.trim()).filter(Boolean); await A.db.savePhoto(ph); }
  if (r === 'edit') A.router.go('photoEdit', { photoId: ph.id });
  if (r === 'album') A.addPhotosToAlbum([ph.id]);
};

/* יצירת קולאז' כתמונה חדשה */
A.makeCollage = async function (ids) {
  const n = Math.min(9, ids.length);
  const options = A.render.TEMPLATES.filter(t => t.slots.length === n || (n > 6 && t.id === 'nine'));
  const tpl = options[0] || A.render.autoTemplate(ids.map(() => ({ w: 1, h: 1 })));
  const page = A.model.newPage({});
  A.render.applyTemplate(page, tpl, ids.slice(0, tpl.slots.length));
  const al = { size: 'square', pageStyle: 'white', finish: 'matte' };
  const c = await A.render.page(al, page, 2400, { size: 'orig' });
  const b = await A.canvasToBlob(c, 'image/jpeg', 0.92);
  const rec = await A.photos.addGenerated(b, 'קולאז׳.jpg', 'collage');
  A.toast('🧩 נוצר קולאז׳ חדש בספרייה');
  return rec;
};

/* ================= חיפוש ================= */
A.screens.search = async function () {
  const s = A.h('div.screen');
  s.appendChild(A.header('חיפוש'));
  const q = A.h('input.inp.search', { type: 'search', placeholder: 'שם אלבום, כיתוב, מילת מפתח, שנה או חודש…', 'aria-label': 'חיפוש' });
  const from = A.h('input.inp', { type: 'date', 'aria-label': 'מתאריך' }), to = A.h('input.inp', { type: 'date', 'aria-label': 'עד תאריך' });
  const res = A.h('div');
  s.append(A.h('div.field', null, q), A.h('div.row', null, A.h('label.field.half', null, A.h('span', null, 'מתאריך'), from), A.h('label.field.half', null, A.h('span', null, 'עד תאריך'), to)), res);
  let t;
  [q, from, to].forEach(i => i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 250); }));
  setTimeout(() => q.focus(), 200);
  return s;

  async function run() {
    const text = q.value.trim();
    const f = from.value ? Date.parse(from.value) : null, tt = to.value ? Date.parse(to.value) + 864e5 : null;
    res.innerHTML = '';
    if (!text && !f && !tt) return;
    const albums = await A.db.albums();
    const monthIdx = A.HEB_MONTHS.findIndex(m => text && m.startsWith(text.replace(/^ב/, '')));
    const yr = /^\d{4}$/.test(text) ? +text : null;
    const matchA = albums.filter(a => text && [a.name, a.title, a.category, a.dedication].some(x => (x || '').includes(text)));
    let photos = await A.db.photos();
    photos = photos.filter(p => {
      const d = A.photos.date(p), dd = new Date(d);
      if (f && d < f) return false;
      if (tt && d > tt) return false;
      if (!text) return true;
      if (yr) return dd.getFullYear() === yr;
      if (monthIdx >= 0 && text.length >= 3) return dd.getMonth() === monthIdx;
      return (p.caption || '').includes(text) || (p.name || '').includes(text) || (p.tags || []).some(x => x.includes(text));
    }).sort((a, b) => A.photos.date(b) - A.photos.date(a));
    if (matchA.length) {
      res.appendChild(A.h('h3', null, 'אלבומים (' + matchA.length + ')'));
      const l = A.h('div.list');
      matchA.forEach(a => l.appendChild(A.h('button.list-item', { type: 'button', onclick: async () => { if (await A.security.unlockAlbum(a)) A.router.go('viewer', { albumId: a.id, autoOpen: true }); } }, '📘 ' + a.name + ' · ' + (a.category || ''))));
      res.appendChild(l);
    }
    res.appendChild(A.h('h3', null, 'תמונות (' + photos.length + ')'));
    const g = A.h('div.pgrid');
    photos.slice(0, 300).forEach(p => {
      const im = A.h('img', { alt: p.caption || '', loading: 'lazy' });
      A.cache.photoUrl(p, 'thumb').then(u => { if (u) im.src = u; });
      g.appendChild(A.h('button.pcell', { type: 'button', onclick: () => A.photoDetail(p) }, im));
    });
    res.appendChild(g);
    if (!matchA.length && !photos.length) res.appendChild(A.h('p.muted', null, 'לא נמצאו תוצאות.'));
  }
};

/* ================= הגדרות ================= */
A.screens.settings = async function () {
  const s = A.h('div.screen');
  s.appendChild(A.header('הגדרות'));
  const st = A.settings;
  const sec = (title, ...rows) => A.h('section.card', null, A.h('h2', null, title), ...rows);
  const toggle = (label, key, after) => {
    const c = A.h('input', { type: 'checkbox', checked: !!st.get(key), onchange: e => { st.set(key, e.target.checked); if (after) after(e.target.checked); } });
    return A.h('label.switch-row', null, A.h('span', null, label), c);
  };
  const choose = (label, key, opts, after) => A.h('label.field', null, A.h('span', null, label),
    A.h('select.inp', { onchange: e => { const v = isNaN(+e.target.value) ? e.target.value : +e.target.value; st.set(key, v); if (after) after(v); } },
      opts.map(([v, l]) => A.h('option', { value: v, selected: String(st.get(key)) === String(v) }, l))));
  const est = await A.db.estimate();
  const counts = { a: await A.db.count('albums'), p: await A.db.count('photos'), m: await A.db.count('media') };
  const pinSet = !!A.security.appPin();
  s.append(
    sec('🎨 תצוגה',
      choose('ערכת צבעים', 'theme', [['auto', 'לפי המכשיר'], ['light', 'בהיר'], ['dark', 'כהה']], A.applyTheme),
      choose('גודל טקסט', 'textScale', [[0.9, 'קטן'], [1, 'רגיל'], [1.15, 'גדול'], [1.3, 'גדול מאוד']], A.applyTheme),
      choose('תצוגת הספרייה', 'shelf', [['wood', 'מדף ספרים מעץ'], ['modern', 'ספרייה מודרנית'], ['minimal', 'גלריה מינימליסטית']]),
      choose('איכות אנימציה', 'quality', [['auto', 'אוטומטי'], ['high', 'גבוהה'], ['low', 'חסכונית (למכשירים חלשים)']]),
      toggle('צליל דפדוף בנייר', 'sound')),
    sec('🔐 אבטחה ופרטיות',
      A.h('button.btn', { type: 'button', onclick: () => A.security.setupPin() }, pinSet ? '🔑 שינוי קוד אישי' : '🔑 הגדרת קוד אישי לנעילת האפליקציה'),
      pinSet ? A.h('button.btn', { type: 'button', onclick: () => A.security.removePin() }, '🔓 ביטול נעילת האפליקציה') : null,
      pinSet ? toggle('פתיחה בטביעת אצבע / זיהוי ביומטרי', 'biometric', v => { if (v && !A.native.has()) A.toast('זיהוי ביומטרי זמין רק באפליקציה המותקנת'); }) : null,
      pinSet ? toggle('נעילה אוטומטית כשיוצאים מהאפליקציה', 'autoLock') : null,
      toggle('חסימת צילומי מסך', 'secure', v => A.native.call('setSecure', !!v)),
      A.h('button.btn', { type: 'button', onclick: () => A.security.privacyInfo() }, '🛡️ מדיניות הפרטיות של האפליקציה')),
    sec('⬆️ עדכונים',
      A.h('p.muted', null, 'גרסה מותקנת: ' + A.VERSION + (A.native.has() ? ' (בנייה ' + (A.native.call('getVersionCode') || '?') + ')' : '')),
      toggle('בדיקת עדכונים אוטומטית בפתיחה', 'autoUpdate'),
      A.h('button.btn', { type: 'button', onclick: () => A.update.check(true) }, '🔄 בדיקת עדכונים עכשיו')),
    sec('💽 אחסון',
      A.h('p', null, counts.a + ' אלבומים · ' + counts.p + ' תמונות · ' + counts.m + ' קובצי מדיה'),
      est ? A.h('p.muted', null, 'בשימוש: ' + A.fmtBytes(est.usage) + (est.quota ? ' · פנוי לאפליקציה: ' + A.fmtBytes(est.quota - est.usage) : '')) : null,
      A.h('button.btn', { type: 'button', onclick: () => A.router.go('backup', {}) }, '💾 גיבוי ושחזור')),
    sec('🔧 תחזוקה',
      A.h('button.btn.primary', { type: 'button', onclick: () => A.router.go('diagnostics', {}) }, '🔧 בדיקת תקינות האפליקציה'),
      A.h('button.btn', { type: 'button', onclick: () => A.router.go('roadmap', {}) }, '🗺️ מה מומש ומה בתוכנית הפיתוח')),
    sec('ℹ️ אודות', A.h('p', null, '📸 האלבום שלי · גרסה ' + A.VERSION), A.h('p', null, 'תוכנן ונוצר על ידי איתן נוה'), A.h('p.muted', null, 'כל התמונות נשמרות במכשיר בלבד. האפליקציה פועלת במלואה ללא אינטרנט.'))
  );
  return s;
};

/* ================= מה מומש ומה בתוכנית ================= */
A.ROADMAP = {
  done: ['ספריית אלבומים במדף תלת־ממדי (עץ / מודרני / מינימליסטי) עם אנימציית שליפה', 'דפדוף תלת־ממדי עם קיפול דף, צללים, תאורה, עובי וצליל — כספר עברי', 'פתיחה וסגירה של הכריכה, סיבוב האלבום, הגדלה בצביטה', 'יצירת אלבומים ללא הגבלה: כריכת עור/בד/עץ/קרטון, צבע, גודל, נייר, גימור מבריק/מט, הקדשה', 'עורך עמודים: גרירה, שינוי גודל וסיבוב באצבעות, 35 תבניות, צורות, מסגרות, טקסט, מדבקות ואיורים, תמונה על שני עמודים, שכפול/מחיקה/סידור עמודים, ביטול ושחזור', 'עורך תמונות לא הרסני: חיתוך, סיבוב, יישור, שינוי גודל, בהירות, ניגודיות, רוויה, חדות, טמפרטורה, חשיפה, הסרת רעשים, עיניים אדומות, שחזור צבעים דהויים, שיפור תמונות חשוכות, מחיקת פגמים קטנים, אפקטים ופילטרים, מסגרות, טקסט, מדבקות, תאריך וחתימה', 'סרטונים, הקלטות קול ומוזיקת רקע בעמודים', 'עוזר עיצוב מקומי: עיצוב אוטומטי, מיון לפי תאריך/מקום/אירוע/דמיון, איתור כפילויות, בחירת התמונות האיכותיות, כיתובים לפי תאריך ואירוע, עיצוב לפי תיאור טקסטואלי, סיפור משפחתי כרונולוגי', 'זיכרונות: היום לפני שנה, אלבום זיכרונות לפי תקופה', 'סריקת תמונות ישנות עם תיקון פרספקטיבה', 'יצוא PDF (כולל הכנה להדפסה: גודל, שוליים, 300DPI, אזורי חיתוך וכריכה), JPG/PNG, אלבום דיגיטלי אינטראקטיבי, סרטון דפדוף, מצגת', 'שיתוף בוואטסאפ, בדו״ל ושמירה במכשיר; העברת אלבום למכשיר אחר', 'גיבוי ושחזור מלאים עם הצפנה בסיסמה', 'נעילת אפליקציה בקוד וביומטרי, נעילת אלבומים, חסימת צילומי מסך', 'בדיקת תקינות עם דוח ותיקון בטוח', 'כפתור שדרוג כשיש גרסה חדשה'],
  planned: ['הסרת רקע וטשטוש רקע בבינה מלאכותית (דורש מודל לזיהוי אנשים)', 'צביעת תמונות שחור־לבן בבינה מלאכותית', 'כיתובים לפי תוכן התמונה (זיהוי מה רואים בתמונה)', 'קוד QR בהדפסה שמקשר לסרטונים — דורש אחסון בענן', 'אלבום משפחתי משותף עם סנכרון מאובטח', 'גיבוי ישיר לענן (כרגע: שמירת קובץ גיבוי מוצפן ושיתופו לכונן לבחירתכם)', 'גרסת אייפון (iOS)']
};
A.screens.roadmap = async function () {
  const s = A.h('div.screen');
  s.appendChild(A.header('מה מומש ומה בתוכנית'));
  s.append(A.h('section.card', null, A.h('h2', null, '✅ פעיל בגרסה ' + A.VERSION), A.h('ul.roadmap', null, A.ROADMAP.done.map(t => A.h('li', null, t)))),
    A.h('section.card', null, A.h('h2', null, '🕓 בתוכנית הפיתוח (עדיין לא פעיל)'), A.h('ul.roadmap.todo', null, A.ROADMAP.planned.map(t => A.h('li', null, t)))));
  return s;
};
