/* האלבום שלי — ניתוב מסכים, מסך הבית ומדף האלבומים התלת־ממדי */
'use strict';
A.VERSION = '1.0.0';
A.screens = A.screens || {};

A.router = {
  stack: [],
  async go(name, params, replace) {
    if (this.busy) return;
    this.busy = true;
    try {
      const prev = this.stack[this.stack.length - 1];
      if (prev && prev.leave) prev.leave();
      if (replace) this.stack.pop();
      const entry = { name, params: params || {} };
      this.stack.push(entry);
      await this.render(entry);
    } finally { this.busy = false; }
  },
  async render(entry) {
    const host = A.$('#app');
    let el;
    try {
      const out = await A.screens[entry.name](entry.params, entry);
      el = out instanceof Node ? out : out.el;
      entry.leave = out && out.leave;
    } catch (e) {
      console.error(e);
      el = A.h('div.screen', null, A.h('div.empty', null, A.h('h2', null, 'אירעה שגיאה'), A.h('p', null, e.message || String(e)), A.h('button.btn.primary', { type: 'button', onclick: () => A.router.home() }, 'חזרה למסך הבית')));
    }
    host.innerHTML = '';
    el.classList.add('enter');
    host.appendChild(el);
    host.scrollTop = 0;
    requestAnimationFrame(() => el.classList.remove('enter'));
  },
  back() {
    if (this.stack.length <= 1) return false;
    const cur = this.stack.pop();
    if (cur.leave) cur.leave();
    this.render(this.stack[this.stack.length - 1]);
    return true;
  },
  home() { const cur = this.stack[this.stack.length - 1]; if (cur && cur.leave) cur.leave(); this.stack = []; this.go('home'); },
  refresh() { const cur = this.stack[this.stack.length - 1]; if (cur) { if (cur.leave) cur.leave(); this.render(cur); } }
};

/* כותרת מסך */
A.header = (title, opts) => A.h('header.top', null,
  A.h('button.iconbtn', { type: 'button', 'aria-label': 'חזרה', onclick: () => A.router.back() }, '→'),
  A.h('h1', null, title),
  (opts && opts.action) || A.h('span.sp'));

/* ================= מסך הבית ================= */
A.screens.home = async function () {
  const albums = await A.db.albums();
  const s = A.h('div.screen.home');
  const head = A.h('div.home-head', null,
    A.h('div.brand', null, A.h('span.logo', null, '📸'), A.h('div', null, A.h('h1', null, 'האלבום שלי'), A.h('small', null, 'גרסה ' + A.VERSION))));
  s.appendChild(head);
  const upd = A.update && A.update.available;
  if (upd) s.appendChild(A.h('button.update-btn', { type: 'button', onclick: () => A.update.install() }, '⬆️ עדכון לגרסה ' + upd.name + ' — לחצו לעדכון'));
  else if (A.native.has()) s.appendChild(A.h('button.update-btn.idle', { type: 'button', onclick: () => A.update.check(true) }, '🔄 עדכון גרסה · מותקנת ' + A.VERSION));
  const grid = A.h('nav.main-grid', { 'aria-label': 'תפריט ראשי' },
    tile('📚', 'האלבומים שלי', () => A.$('.shelf-wrap', s).scrollIntoView({ behavior: 'smooth' })),
    tile('➕', 'יצירת אלבום חדש', () => A.router.go('albumForm', {})),
    tile('🖼️', 'הוספת תמונות', () => A.router.go('library', {})),
    tile('✏️', 'עריכת תמונות', () => A.router.go('library', { pickToEdit: true })),
    tile('🎨', 'עיצוב אלבום', () => chooseAlbum('איזה אלבום לעצב?', al => A.router.go('editor', { albumId: al.id, page: 0 }))),
    tile('🔍', 'חיפוש', () => A.router.go('search', {})),
    tile('💾', 'גיבוי ושחזור', () => A.router.go('backup', {})),
    tile('⚙️', 'הגדרות', () => A.router.go('settings', {})));
  s.appendChild(grid);
  s.appendChild(A.h('div.quick-row', null,
    A.h('button.chip', { type: 'button', onclick: () => A.router.go('assistant', {}) }, '🤖 עוזר העיצוב'),
    A.h('button.chip', { type: 'button', onclick: () => A.router.go('memories', {}) }, '🗓️ זיכרונות'),
    A.h('button.chip', { type: 'button', onclick: () => A.scan.start() }, '📷 סריקת תמונה ישנה'),
    A.h('button.chip', { type: 'button', onclick: () => A.cloud.join() }, '🤝 הצטרפות לאלבום משותף')));
  /* היום לפני שנה */
  A.memories.todayCard().then(card => { if (card) s.insertBefore(card, A.$('.shelf-wrap', s)); });
  /* המדף */
  const wrap = A.h('section.shelf-wrap', { 'aria-label': 'מדף האלבומים' });
  const tools = A.h('div.shelf-tools', null,
    sel([['updated', 'אחרון שעודכן'], ['date', 'תאריך יצירה'], ['name', 'שם'], ['cat', 'קטגוריה'], ['fav', 'מועדפים קודם']], A.settings.get('sort') || 'updated', v => { A.settings.set('sort', v); A.router.refresh(); }),
    sel([['wood', 'מדף עץ'], ['modern', 'ספרייה מודרנית'], ['minimal', 'גלריה מינימליסטית']], A.settings.get('shelf'), v => { A.settings.set('shelf', v); A.router.refresh(); }));
  wrap.appendChild(A.h('div.shelf-title', null, A.h('h2', null, '📚 האלבומים שלי (' + albums.length + ')'), tools));
  const sorted = sortAlbums(albums, A.settings.get('sort') || 'updated');
  wrap.appendChild(await A.shelf.build(sorted));
  s.appendChild(wrap);
  s.appendChild(A.h('footer.credit', null, 'תוכנן ונוצר על ידי איתן נוה'));
  return s;

  function tile(icon, label, fn) { return A.h('button.tile', { type: 'button', onclick: fn }, A.h('span.ti', null, icon), A.h('span.tl', null, label)); }
  function sel(opts, val, fn) { const se = A.h('select.sel', { onchange: e => fn(e.target.value), 'aria-label': 'תצוגה' }, opts.map(([v, l]) => A.h('option', { value: v, selected: v === val }, l))); return se; }
};
function sortAlbums(list, by) {
  const a = list.slice();
  if (by === 'name') a.sort((x, y) => x.name.localeCompare(y.name, 'he'));
  else if (by === 'date') a.sort((x, y) => y.createdAt - x.createdAt);
  else if (by === 'cat') a.sort((x, y) => (x.category || '').localeCompare(y.category || '', 'he') || x.name.localeCompare(y.name, 'he'));
  else if (by === 'fav') a.sort((x, y) => (y.favorite ? 1 : 0) - (x.favorite ? 1 : 0) || y.updatedAt - x.updatedAt);
  return a;
}
A.sortAlbums = sortAlbums;

async function chooseAlbum(title, fn) {
  const albums = await A.db.albums();
  if (!albums.length) { const ok = await A.confirm('אין עדיין אלבומים', 'ליצור אלבום חדש עכשיו?', 'יצירת אלבום'); if (ok) A.router.go('albumForm', {}); return; }
  const box = A.h('div.list');
  let close;
  albums.forEach(al => box.appendChild(A.h('button.list-item', { type: 'button', onclick: () => { close(); fn(al); } }, (al.locked ? '🔒 ' : '📘 ') + al.name)));
  A.modal(title, box, [{ label: 'ביטול', value: null }], { onOpen: (c, cl) => { close = cl; } });
}
A.chooseAlbum = chooseAlbum;

/* ================= מדף תלת־ממדי ================= */
A.shelf = {};
A.shelf.build = async function (albums) {
  const style = A.settings.get('shelf') || 'wood';
  const box = A.h('div.shelf.' + style);
  if (!albums.length) {
    box.appendChild(A.h('div.empty', null, A.h('div.big', null, '📖'), A.h('p', null, 'המדף ריק. צרו את האלבום הראשון שלכם!'), A.h('button.btn.primary', { type: 'button', onclick: () => A.router.go('albumForm', {}) }, '➕ יצירת אלבום חדש')));
    return box;
  }
  const perRow = Math.max(2, Math.floor((window.innerWidth - 24) / 118));
  for (let r = 0; r < albums.length; r += perRow) {
    const row = A.h('div.shelf-row');
    const books = A.h('div.books');
    albums.slice(r, r + perRow).forEach(al => books.appendChild(bookEl(al)));
    row.append(books, A.h('div.plank'));
    box.appendChild(row);
  }
  return box;

  function bookEl(al) {
    const asp = A.model.aspect(al);
    const W = 96, H = Math.round(W / asp * (asp > 1 ? 1 : 1)), T = Math.round(10 + Math.min(18, al.pages.length * 0.2));
    const b = A.h('button.sbook', { type: 'button', 'aria-label': 'פתיחת האלבום ' + al.name });
    b.style.setProperty('--w', W + 'px'); b.style.setProperty('--h', Math.min(130, H) + 'px'); b.style.setProperty('--t', T + 'px'); b.style.setProperty('--c', al.coverColor);
    const front = A.h('div.f.front'), spine = A.h('div.f.spine', null, A.h('span', null, al.name)), top = A.h('div.f.top'), pages = A.h('div.f.pages');
    const obj = A.h('div.obj', null, front, spine, top, pages);
    b.append(obj, A.h('div.blabel', null, (al.favorite ? '⭐ ' : '') + (al.locked ? '🔒 ' : '') + (al.share ? '👨‍👩‍👧 ' : '') + al.name));
    A.render.cover(al, 220).then(c => A.canvasToBlob(c, 'image/jpeg', 0.85)).then(bl => { front.style.backgroundImage = 'url("' + URL.createObjectURL(bl) + '")'; }).catch(() => {});
    spine.style.background = al.coverColor;
    let pressT = null, long = false;
    b.addEventListener('pointerdown', () => { long = false; pressT = setTimeout(() => { long = true; A.albumMenu(al); }, 550); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => clearTimeout(pressT)));
    b.addEventListener('contextmenu', e => e.preventDefault());
    b.addEventListener('click', async () => {
      if (long) return;
      if (!(await A.security.unlockAlbum(al))) return;
      b.classList.add('pull');
      A.sound.flip();
      setTimeout(() => A.router.go('viewer', { albumId: al.id, autoOpen: true }), 520);
    });
    return b;
  }
};

/* תפריט פעולות לאלבום (לחיצה ארוכה) */
A.albumMenu = async function (al) {
  const items = [
    ['📖', 'פתיחה', async () => { if (await A.security.unlockAlbum(al)) A.router.go('viewer', { albumId: al.id, autoOpen: true }); }],
    ['🎨', 'עיצוב עמודים', async () => { if (await A.security.unlockAlbum(al)) A.router.go('editor', { albumId: al.id, page: 0 }); }],
    ['⚙️', 'פרטי האלבום וכריכה', async () => { if (await A.security.unlockAlbum(al)) A.router.go('albumForm', { albumId: al.id }); }],
    ['✍️', 'שינוי שם', async () => { const n = await A.prompt('שינוי שם', 'שם האלבום', al.name); if (n && n.trim()) { al.name = n.trim(); await A.db.saveAlbum(al); A.router.refresh(); } }],
    [al.favorite ? '☆' : '⭐', al.favorite ? 'הסרה ממועדפים' : 'סימון כמועדף', async () => { al.favorite = !al.favorite; await A.db.saveAlbum(al); A.router.refresh(); }],
    ['📋', 'העתקת אלבום', async () => { const c = JSON.parse(JSON.stringify(al)); c.id = A.uid(); c.name = al.name + ' (עותק)'; c.createdAt = Date.now(); c.pages.forEach(p => { p.id = A.uid(); p.elements.forEach(e => { e.id = A.uid(); }); }); await A.db.saveAlbum(c); A.toast('האלבום הועתק'); A.router.refresh(); }],
    ['🔒', al.locked ? 'ביטול נעילה' : 'נעילת אלבום', () => A.security.toggleAlbumLock(al)],
    ['📤', 'יצוא ושיתוף', async () => { if (await A.security.unlockAlbum(al)) A.exporter.menu(al); }],
    ['🌐', al.pub ? 'קישור וקוד QR לצפייה (מפורסם)' : 'פרסום לצפייה בקישור וקוד QR', async () => { if (await A.security.unlockAlbum(al)) { if (al.pub) A.cloud.showPub(al); else A.cloud.publish(al); } }],
    ['👨‍👩‍👧', al.share ? 'אלבום משותף — סנכרון והזמנה' : 'שיתוף עם המשפחה (אלבום משותף)', async () => { if (await A.security.unlockAlbum(al)) A.cloud.shareMenu(al); }],
    ['🗑️', 'מחיקת אלבום', () => A.deleteAlbum(al)]
  ];
  const box = A.h('div.list');
  let close;
  items.forEach(([i, l, f]) => box.appendChild(A.h('button.list-item', { type: 'button', onclick: () => { close(); f(); } }, i + ' ' + l)));
  A.modal('📘 ' + al.name, box, [{ label: 'סגירה', value: null }], { onOpen: (c, cl) => { close = cl; } });
};

A.deleteAlbum = async function (al) {
  if (!(await A.security.unlockAlbum(al))) return;
  const chk = A.h('input', { type: 'checkbox' });
  const body = A.h('div', null, A.h('p', null, 'למחוק את האלבום "' + al.name + '"? פעולה זו אינה הפיכה.'),
    A.h('label.check', null, chk, ' למחוק לצמיתות גם תמונות שאינן בשימוש באלבומים אחרים'));
  const ok = await A.modal('מחיקת אלבום', body, [{ label: 'ביטול', value: false }, { label: '🗑️ מחיקה', value: true, cls: 'danger' }]);
  if (!ok) return;
  const ids = A.model.photoIds(al), mids = A.model.mediaIds(al);
  await A.db.del('albums', al.id);
  if (chk.checked) {
    const others = await A.db.albums();
    const used = new Set(), usedM = new Set();
    others.forEach(o => { A.model.photoIds(o).forEach(i => used.add(i)); A.model.mediaIds(o).forEach(i => usedM.add(i)); });
    for (const id of ids) if (!used.has(id)) await A.db.deletePhoto(id);
    for (const id of mids) if (!usedM.has(id)) await A.db.deleteMedia(id);
  }
  A.toast('האלבום נמחק');
  A.router.home();
};

/* ================= מסך הצפייה ================= */
A.screens.viewer = async function (p) {
  const al = await A.db.album(p.albumId);
  if (!al) throw new Error('האלבום לא נמצא');
  const el = await A.viewer.open(al, p.page);
  const s = A.h('div.screen.full', null, el);
  if (p.autoOpen && p.page == null) setTimeout(() => A.viewer.next(), 450);
  p.autoOpen = false;
  return { el: s, leave: () => A.viewer.close() };
};

/* ================= אתחול ================= */
A.applyTheme = function () {
  const t = A.settings.get('theme');
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.setProperty('--ts', A.settings.get('textScale'));
};

A.boot = async function () {
  const fam = A.render.TEMPLATES.find(t => t.id === 'family'); if (fam) fam.name = 'קולאז׳ משפחתי';
  if (A.native.has()) { const v = A.native.call('getVersionName'); if (v) A.VERSION = v; const o = A.update.ota(); if (o && o.name) A.VERSION = o.name; }
  A.applyTheme();
  try { await A.db.open(); }
  catch (e) { A.$('#app').innerHTML = '<div class="empty"><h2>לא ניתן לפתוח את מסד הנתונים</h2><p>' + A.esc(e.message) + '</p></div>'; return; }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* לא נתמך */ }
  await A.render.preloadIllus();
  if (A.settings.get('secure')) A.native.call('setSecure', true);
  const unlocked = await A.security.appGate();
  if (!unlocked) return;
  await A.router.go('home');
  A.native.call('bootOk');
  if (A.native.call('otaRolledBack')) A.alert('העדכון האחרון בוטל', 'העדכון המהיר האחרון לא נפתח כראוי, ולכן האפליקציה חזרה אוטומטית לגרסה הקודמת. הנתונים שלכם לא נפגעו.');
  if (A.settings.get('autoUpdate')) setTimeout(() => A.update.check(false), 2500);
};

/* קריאות מהמעטפת של אנדרואיד */
window.App = {
  onBack() { return A.onBack(); },
  onPause() { A.security.onPause(); },
  onResume() { A.security.onResume(); }
};

document.addEventListener('DOMContentLoaded', () => A.boot());
window.addEventListener('error', e => { console.error(e.error || e.message); });
window.addEventListener('unhandledrejection', e => { console.error(e.reason); if (e.reason && e.reason.name === 'QuotaExceededError') A.alert('אין מספיק מקום', 'שטח האחסון במכשיר מלא. פנו מקום ונסו שוב.'); });
