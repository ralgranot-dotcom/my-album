/* האלבום שלי — עוזר עיצוב חכם (פועל במכשיר), זיכרונות וסריקת תמונות ישנות */
'use strict';
A.ai = {};

/* ---- כלי ניתוח ---- */
A.ai.events = function (photos, gapHours) {
  const s = photos.slice().sort((a, b) => A.photos.date(a) - A.photos.date(b));
  const groups = [];
  let cur = null, last = 0;
  s.forEach(p => {
    const d = A.photos.date(p);
    if (!cur || d - last > (gapHours || 6) * 3600e3) { cur = { start: d, photos: [] }; groups.push(cur); }
    cur.photos.push(p); last = d;
  });
  groups.forEach(g => { g.end = A.photos.date(g.photos[g.photos.length - 1]); });
  return groups;
};
A.ai.places = function (photos) {
  const m = new Map();
  photos.forEach(p => {
    const k = p.gps ? (Math.round(p.gps.lat * 20) / 20).toFixed(2) + ',' + (Math.round(p.gps.lon * 20) / 20).toFixed(2) : 'ללא מיקום';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  });
  return Array.from(m.entries()).map(([k, ps]) => ({ key: k, photos: ps.sort((a, b) => A.photos.date(a) - A.photos.date(b)) }));
};
/* סדר לפי דמיון חזותי: שרשרת השכן הקרוב */
A.ai.bySimilarity = function (photos) {
  if (photos.length < 3) return photos.slice();
  const left = photos.slice(), out = [left.shift()];
  while (left.length) {
    const last = out[out.length - 1];
    let bi = 0, bd = 99;
    left.forEach((p, i) => { const d = A.photos.hamming(last.hash, p.hash); if (d < bd) { bd = d; bi = i; } });
    out.push(left.splice(bi, 1)[0]);
  }
  return out;
};
A.ai.duplicates = function (photos, thr) {
  const groups = [], used = new Set();
  for (let i = 0; i < photos.length; i++) {
    if (used.has(photos[i].id)) continue;
    const g = [photos[i]];
    for (let j = i + 1; j < photos.length; j++) {
      if (used.has(photos[j].id)) continue;
      if (A.photos.hamming(photos[i].hash, photos[j].hash) <= (thr == null ? 6 : thr)) { g.push(photos[j]); used.add(photos[j].id); }
    }
    if (g.length > 1) { used.add(photos[i].id); groups.push(g.sort((a, b) => (b.quality || 0) - (a.quality || 0))); }
  }
  return groups;
};
const DAYPART = h => h < 5 ? 'בלילה' : h < 12 ? 'בבוקר' : h < 17 ? 'בצהריים' : h < 21 ? 'בערב' : 'בלילה';
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
A.ai.caption = function (p, evIdx) {
  const t = A.photos.date(p);
  if (!t) return '';
  const d = new Date(t);
  const day = d.getDay() === 6 ? 'שבת' : 'יום ' + DAYS[d.getDay()];
  return day + ' ' + (p.takenAt ? DAYPART(d.getHours()) + ', ' : ', ') + d.getDate() + ' ב' + A.HEB_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
};

/* בניית עמודים מרשימת תמונות (מחזיר עמודים חדשים) */
A.ai.layoutPages = function (photos, opts) {
  opts = opts || {};
  const pages = [];
  const groups = opts.byEvent ? A.ai.events(photos) : [{ photos }];
  groups.forEach((g, gi) => {
    if (opts.titles && groups.length > 1) {
      const pg = A.model.newPage({});
      A.render.applyTemplate(pg, A.render.TEMPLATES.find(t => t.id === 'title'), []);
      const tx = pg.elements.filter(e => e.type === 'text');
      const d = new Date(g.start);
      tx[0].text = opts.titleFn ? opts.titleFn(g, gi) : A.HEB_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
      tx[1].text = A.fmtDate(g.start) + (g.end - g.start > 864e5 ? ' – ' + A.fmtDate(g.end) : '') + ' · ' + g.photos.length + ' תמונות';
      pages.push(pg);
    }
    const q = g.photos.slice();
    while (q.length) {
      const best = q.length === 1 ? 1 : Math.min(q.length, [1, 2, 2, 3, 3, 4, 4, 5, 6][Math.floor(Math.random() * 9)]);
      const take = q.splice(0, best);
      const pg = A.model.newPage({});
      const themedFit = (opts.themed || []).map(id => A.render.TEMPLATES.find(t => t.id === id)).filter(t => t && t.slots.length === take.length);
      const tpl = themedFit.length && Math.random() < 0.5 ? themedFit[Math.floor(Math.random() * themedFit.length)] : A.render.autoTemplate(take);
      A.render.applyTemplate(pg, tpl, take.map(p => p.id));
      pages.push(pg);
    }
  });
  if (pages.length % 2) pages.push(A.model.newPage({}));
  if (pages.length < 2) pages.push(A.model.newPage({}), A.model.newPage({}));
  return pages;
};

/* ---- פענוח בקשה טקסטואלית ---- */
A.ai.parseTheme = function (text) {
  const t = text || '';
  const has = (...w) => w.some(x => t.includes(x));
  const o = { name: '', category: 'אישי', coverType: 'leather', coverColor: '#6b2d2d', pageStyle: 'white', finish: 'matte', size: 'square', themed: [], frame: null, pageCount: 24 };
  const cats = [[['חתונה', 'חתן', 'כלה'], 'חתונה', ['wedding', 'heart', 'two_diag', 'one', 'polaroid']], [['בר מצווה', 'בר-מצווה'], 'בר מצווה', ['barmitzva', 'one_cap', 'family']], [['בת מצווה', 'בת-מצווה'], 'בת מצווה', ['barmitzva', 'heart', 'family']],
    [['טיול', 'חופשה', 'נסיעה', 'חו"ל', 'טיולים'], 'טיולים', ['trip', 'polaroid', 'polaroid3', 'filmstrip']], [['תינוק', 'לידה', 'ברית'], 'ילדים', ['baby', 'circle', 'circles3']], [['ילדים', 'ילד', 'ילדה'], 'ילדים', ['birthday', 'circles3', 'polaroid']],
    [['נכד', 'נכדים', 'נכדה'], 'נכדים', ['family', 'heart', 'circles3']], [['חג', 'פסח', 'חנוכה', 'ראש השנה', 'סוכות', 'פורים'], 'חגים', ['holiday', 'one_cap']], [['יום הולדת', 'יומולדת'], 'אירועים', ['birthday', 'polaroid']],
    [['ילדות', 'זיכרונות', 'נוסטלגי'], 'זיכרונות ילדות', ['antique', 'memory', 'polaroid']], [['משפחה', 'משפחתי'], 'משפחתי', ['family', 'polaroid3', 'four']]];
  for (const [ws, cat, tpls] of cats) if (has(...ws)) { o.category = cat; o.themed = tpls; break; }
  if (has('עור')) o.coverType = 'leather'; else if (has('בד', 'פשתן')) o.coverType = 'fabric'; else if (has('עץ')) o.coverType = 'wood'; else if (has('קרטון')) o.coverType = 'cardboard';
  const colors = [[['לבן', 'לבנה'], '#f3efe6'], [['שחור', 'שחורה'], '#111111'], [['בורדו', 'אדום', 'אדומה'], '#6b2d2d'], [['כחול', 'כחולה', 'נייבי'], '#1f3a5f'], [['ירוק', 'ירוקה'], '#2f4a32'], [['חום', 'חומה'], '#3b2a20'], [['זהב', 'זהובה', 'זהוב'], '#c9a96e'], [['סגול', 'סגולה'], '#5d3a6b'], [['ורוד', 'ורודה'], '#a3485a'], [['אפור', 'אפורה', 'כסף'], '#8a8f98'], [['תכלת', 'טורקיז'], '#2c5d63']];
  for (const [ws, c] of colors) if (has(...ws)) { o.coverColor = c; break; }
  if (has('יוקרה', 'יוקרתי', 'מפואר', 'אלגנטי')) { o.finish = 'glossy'; o.pageStyle = o.pageStyle === 'white' ? 'cream' : o.pageStyle; o.frame = 'gold'; }
  if (has('עתיק', 'וינטג', 'ישן', 'רטרו', 'נוסטלג')) { o.pageStyle = 'vintage'; o.themed = o.themed.concat(['antique', 'polaroid']); o.frame = o.frame || 'corners'; }
  if (has('מודרני', 'מינימליסט', 'נקי')) { o.pageStyle = 'white'; o.frame = 'none'; o.themed = ['one', 'two_v', 'three_l', 'magazine', 'mosaic']; }
  if (has('דפים שחורים', 'רקע שחור')) o.pageStyle = 'black';
  if (has('קראפט')) o.pageStyle = 'kraft';
  if (has('מבריק')) o.finish = 'glossy'; if (has('מט')) o.finish = 'matte';
  if (has('לרוחב')) o.size = 'landscape'; else if (has('לאורך')) o.size = 'portrait'; else if (has('ריבוע')) o.size = 'square';
  const m = t.match(/(\d{1,3})\s*(עמודים|דפים|עמ)/); if (m) o.pageCount = A.clamp(+m[1], 2, 200);
  const nm = t.match(/(?:בשם|שנקרא|לשם)\s+["״']?([^"״',.]+)/); o.name = nm ? nm[1].trim() : 'אלבום ' + o.category;
  return o;
};

/* ================= מסך העוזר ================= */
A.screens.assistant = async function () {
  const s = A.h('div.screen');
  s.appendChild(A.header('🤖 עוזר העיצוב'));
  s.appendChild(A.h('p.muted.pad', null, 'העוזר פועל כולו במכשיר, בלי לשלוח תמונות לשום שרת. כל הצעה מוצגת לאישורכם לפני שהיא מבוצעת.'));
  const card = (icon, title, desc, fn) => A.h('button.ai-card', { type: 'button', onclick: fn }, A.h('span.ai-i', null, icon), A.h('span', null, A.h('b', null, title), A.h('small', null, desc)));
  s.append(
    card('💬', 'עיצוב לפי תיאור', 'כתבו למשל: "צור לי אלבום חתונה יוקרתי עם כריכת עור לבנה ודפים מעוצבים"', themeFlow),
    card('✨', 'עיצוב אוטומטי', 'בחרו תמונות — העוזר יסדר אותן בעמודים לפי אירועים', autoFlow),
    card('🗂️', 'מיון תמונות באלבום', 'לפי תאריך, מקום, אירוע או דמיון חזותי', sortFlow),
    card('👯', 'איתור תמונות כפולות', 'מציאת תמונות זהות או דומות והצעה להסרה', () => A.ai.duplicatesUI()),
    card('🏆', 'בחירת התמונות המוצלחות', 'לפי חדות, תאורה ורזולוציה', bestFlow),
    card('💬', 'יצירת כיתובים', 'כיתובים לפי תאריך, יום ושעת הצילום', captionFlow),
    card('📜', 'סיפור משפחתי', 'רצף כרונולוגי עם כותרות לכל תקופה', storyFlow),
    card('✂️', 'הסרת / טשטוש רקע', 'זיהוי הנושא בתמונה והסרה, החלפה או טשטוש של הרקע', () => A.aiTools.bgFlow()),
    card('🎨', 'צביעת תמונה בשחור־לבן', 'בינה מלאכותית שצובעת תמונות ישנות — במכשיר', () => A.aiTools.colorFlow()),
    card('🏷️', 'זיהוי תוכן ותיוג', 'זיהוי מה רואים בתמונות, תגיות וכיתובים בעברית לחיפוש', () => A.aiTools.labelFlow()),
    card('↩️', 'ביטול פעולת העוזר האחרונה', 'החזרת אלבום למצבו הקודם', undoFlow));
  return s;

  async function themeFlow() {
    const ta = A.h('textarea.inp', { rows: 3, placeholder: 'צור לי אלבום חתונה יוקרתי עם כריכת עור לבנה ודפים מעוצבים' });
    const v = await A.modal('💬 עיצוב לפי תיאור', A.h('div', null, ta, A.h('p.muted', null, 'אפשר לציין: סוג אירוע, סוג כריכה וצבע, סגנון (יוקרתי / עתיק / מודרני), מספר עמודים, גודל.')), [{ label: 'ביטול', value: null }, { label: 'הצעה', value: () => ta.value, cls: 'primary' }], { onOpen: () => setTimeout(() => ta.focus(), 80) });
    if (!v || !v.trim()) return;
    const o = A.ai.parseTheme(v);
    const al = A.model.newAlbum({ name: o.name, category: o.category, coverType: o.coverType, coverColor: o.coverColor, pageStyle: o.pageStyle, finish: o.finish, size: o.size, pageCount: o.pageCount, title: o.name });
    /* עמודים מעוצבים: תבניות לפי נושא, מסגרות לפי סגנון */
    const tpls = o.themed.length ? o.themed : ['one', 'two_v', 'four', 'polaroid'];
    al.pages.forEach((pg, i) => {
      const id = i === 0 ? 'title' : tpls[(i - 1) % tpls.length];
      A.render.applyTemplate(pg, A.render.TEMPLATES.find(t => t.id === id) || A.render.TEMPLATES[0], []);
      if (o.frame) pg.elements.forEach(e => { if (e.type === 'photo' && e.frame !== 'none') e.frame = o.frame; });
    });
    const tx = al.pages[0].elements.filter(e => e.type === 'text'); tx[0].text = o.name; tx[1].text = '';
    const prev = await A.render.cover(al, 360);
    const body = A.h('div', null, A.h('div.cover-prev-wrap', null, prev), A.h('ul.info', null,
      A.h('li', null, 'קטגוריה: ' + o.category), A.h('li', null, 'כריכה: ' + A.model.COVERS[o.coverType]), A.h('li', null, 'דפים: ' + A.model.PAPER[o.pageStyle] + ', ' + A.model.FINISH[o.finish]),
      A.h('li', null, al.pages.length + ' עמודים בעיצוב "' + tpls.map(id => (A.render.TEMPLATES.find(t => t.id === id) || {}).name).filter(Boolean).slice(0, 3).join('", "') + '"'),
      o.frame ? A.h('li', null, 'מסגרות: ' + (A.render.FRAMES[o.frame] || o.frame)) : null));
    const ok = await A.modal('ההצעה של העוזר', body, [{ label: 'ביטול', value: false }, { label: '✨ יצירת האלבום', value: true, cls: 'primary' }]);
    if (!ok) return;
    await A.db.saveAlbum(al);
    A.toast('האלבום נוצר — עכשיו נוסיף תמונות למסגרות');
    A.router.go('editor', { albumId: al.id, page: 1 });
  }
  async function autoFlow() {
    const ids = await A.pickPhotos({ multi: true, title: 'בחרו תמונות לעיצוב אוטומטי' });
    if (!ids.length) return;
    const photos = (await Promise.all(ids.map(i => A.db.photo(i)))).filter(Boolean);
    const evs = A.ai.events(photos);
    const pages = A.ai.layoutPages(photos, { byEvent: true, titles: evs.length > 1 });
    const name = await A.prompt('✨ עיצוב אוטומטי', 'זוהו ' + evs.length + ' אירועים ונבנו ' + pages.length + ' עמודים. שם לאלבום החדש:', 'אלבום ' + A.fmtDate(evs[0].start));
    if (name == null) return;
    const al = A.model.newAlbum({ name: name || 'אלבום חדש', pageCount: 2 });
    al.pages = pages; al.coverPhotoId = (photos.slice().sort((a, b) => (b.quality || 0) - (a.quality || 0))[0] || {}).id || null;
    await A.db.saveAlbum(al);
    A.toast('✅ האלבום נוצר');
    A.router.go('viewer', { albumId: al.id, autoOpen: true });
  }
  async function pickAlbum(title) { return new Promise(res => A.chooseAlbum(title, res)); }
  async function albumPhotos(al) { const ids = Array.from(A.model.photoIds(al)).filter(i => i !== al.coverPhotoId || al.pages.some(p => p.elements.some(e => e.photoId === i))); return (await Promise.all(ids.map(i => A.db.photo(i)))).filter(Boolean); }
  async function sortFlow() {
    const al = await pickAlbum('איזה אלבום למיין?');
    if (!al || !(await A.security.unlockAlbum(al))) return;
    const how = await A.modal('מיון לפי…', A.h('p', null, 'העוזר יסדר מחדש את עמודי האלבום. טקסטים, סרטונים והקלטות יישמרו בעמודים נפרדים בסוף. אפשר לבטל אחר כך.'),
      [{ label: 'ביטול', value: null }, { label: '📅 תאריך', value: 'date' }, { label: '🎉 אירוע', value: 'event' }, { label: '📍 מקום', value: 'place' }, { label: '🎨 דמיון', value: 'sim' }]);
    if (!how) return;
    let photos = await albumPhotos(al);
    if (!photos.length) return A.alert('אין תמונות', 'באלבום הזה עדיין אין תמונות.');
    let pages;
    if (how === 'date') pages = A.ai.layoutPages(photos.sort((a, b) => A.photos.date(a) - A.photos.date(b)));
    else if (how === 'event') pages = A.ai.layoutPages(photos, { byEvent: true, titles: true });
    else if (how === 'sim') pages = A.ai.layoutPages(A.ai.bySimilarity(photos.sort((a, b) => A.photos.date(a) - A.photos.date(b))));
    else {
      const pl = A.ai.places(photos);
      pages = [];
      pl.forEach((g, i) => { const ps = A.ai.layoutPages(g.photos, { byEvent: false }); const t = A.model.newPage({}); A.render.applyTemplate(t, A.render.TEMPLATES.find(x => x.id === 'title'), []); const tx = t.elements.filter(e => e.type === 'text'); tx[0].text = g.key === 'ללא מיקום' ? 'ללא מיקום מתועד' : 'מקום ' + (i + 1); tx[1].text = g.key === 'ללא מיקום' ? '' : 'קואורדינטות: ' + g.key; pages.push(t, ...ps.filter(p => p.elements.length)); });
      if (pages.length % 2) pages.push(A.model.newPage({}));
    }
    const keep = al.pages.filter(p => p.elements.some(e => e.type !== 'photo' && e.type !== 'sticker') && !p.elements.some(e => e.type === 'photo' && e.photoId));
    const media = al.pages.filter(p => p.elements.some(e => e.type === 'video' || e.type === 'audio'));
    const ok = await A.confirm('אישור מיון', 'ייוצרו ' + pages.length + ' עמודים חדשים מ-' + photos.length + ' תמונות. להחיל?', 'החלה');
    if (!ok) return;
    al.prevPages = al.pages;
    al.pages = pages.concat(keep.filter(p => !media.includes(p)), media.map(p => { const c = JSON.parse(JSON.stringify(p)); c.elements = c.elements.filter(e => e.type !== 'photo'); return c; }));
    if (al.pages.length % 2) al.pages.push(A.model.newPage(al));
    await A.db.saveAlbum(al); A.viewer.invalidate();
    A.toast('✅ האלבום מוין');
  }
  async function bestFlow() {
    const src = await A.modal('בחירת התמונות המוצלחות', A.h('p', null, 'מאיפה לבחור?'), [{ label: 'ביטול', value: null }, { label: 'מאלבום', value: 'album' }, { label: 'מכל הספרייה', value: 'all', cls: 'primary' }]);
    if (!src) return;
    let photos;
    if (src === 'album') { const al = await pickAlbum('מאיזה אלבום?'); if (!al) return; photos = await albumPhotos(al); }
    else photos = (await A.db.photos()).filter(p => p.kind === 'photo' || !p.kind);
    if (!photos.length) return A.alert('אין תמונות', 'לא נמצאו תמונות.');
    /* מסננים כפילויות ומשאירים את הטובה מכל קבוצה */
    const dups = A.ai.duplicates(photos);
    const drop = new Set(); dups.forEach(g => g.slice(1).forEach(p => drop.add(p.id)));
    const ranked = photos.filter(p => !drop.has(p.id)).sort((a, b) => (b.quality || 0) - (a.quality || 0));
    const n = Math.max(1, Math.min(ranked.length, Math.ceil(ranked.length * 0.3), 60));
    const top = ranked.slice(0, n);
    const grid = A.h('div.pgrid.small');
    for (const p of top) { const im = A.h('img', { alt: '' }); A.cache.photoUrl(p, 'thumb').then(u => { if (u) im.src = u; }); grid.appendChild(A.h('div.pcell', null, im, A.h('span.badge.q', null, p.quality))); }
    const r = await A.modal('🏆 ' + top.length + ' התמונות המוצלחות', A.h('div', null, A.h('p.muted', null, 'דורג לפי חדות, איזון תאורה, חשיפה ורזולוציה' + (drop.size ? ' · ' + drop.size + ' כפילויות סוננו' : '')), grid),
      [{ label: 'סגירה', value: null }, { label: '📘 אלבום "המיטב"', value: 'album', cls: 'primary' }], { wide: true });
    if (r === 'album') {
      const al = A.model.newAlbum({ name: 'המיטב', category: 'אישי', pageCount: 2 });
      al.pages = A.ai.layoutPages(top.slice().sort((a, b) => A.photos.date(a) - A.photos.date(b)));
      al.coverPhotoId = top[0].id;
      await A.db.saveAlbum(al); A.toast('✅ נוצר אלבום "המיטב"');
    }
  }
  async function captionFlow() {
    const al = await pickAlbum('לאיזה אלבום ליצור כיתובים?');
    if (!al || !(await A.security.unlockAlbum(al))) return;
    const photos = (await albumPhotos(al)).filter(p => !p.caption);
    if (!photos.length) return A.alert('כיתובים', 'לכל התמונות באלבום כבר יש כיתוב.');
    const props = photos.map(p => ({ p, c: A.ai.caption(p) })).filter(x => x.c);
    const list = A.h('div.list');
    props.forEach(x => { const inp = A.h('input.inp', { type: 'text', value: x.c }); inp.addEventListener('input', () => { x.c = inp.value; }); const im = A.h('img.cap-th', { alt: '' }); A.cache.photoUrl(x.p, 'thumb').then(u => { if (u) im.src = u; }); list.appendChild(A.h('div.cap-row', null, im, inp)); });
    const ok = await A.modal('💬 הצעות לכיתובים (' + props.length + ')', A.h('div', null, A.h('p.muted', null, 'הכיתובים מבוססים על תאריך ושעת הצילום. אפשר לערוך כל אחד לפני האישור.'), list), [{ label: 'ביטול', value: false }, { label: 'אישור הכול', value: true, cls: 'primary' }], { wide: true });
    if (!ok) return;
    for (const x of props) { x.p.caption = x.c; await A.db.savePhoto(x.p); }
    A.toast('✅ נוספו ' + props.length + ' כיתובים');
  }
  async function storyFlow() {
    const ids = await A.pickPhotos({ multi: true, title: 'בחרו תמונות לסיפור המשפחתי (או את כולן)' });
    if (!ids.length) return;
    const photos = (await Promise.all(ids.map(i => A.db.photo(i)))).filter(Boolean);
    const pages = A.ai.layoutPages(photos, { byEvent: true, titles: true, titleFn: (g) => { const d = new Date(g.start); return 'שנת ' + d.getFullYear() + ' · ' + A.HEB_MONTHS[d.getMonth()]; } });
    const yrs = new Set(photos.map(p => new Date(A.photos.date(p)).getFullYear()));
    const ok = await A.confirm('📜 סיפור משפחתי', 'ייוצר אלבום כרונולוגי עם ' + pages.length + ' עמודים, ' + yrs.size + ' שנים וכותרת לכל תקופה. ליצור?', 'יצירה');
    if (!ok) return;
    const al = A.model.newAlbum({ name: 'הסיפור המשפחתי שלנו', category: 'משפחתי', coverType: 'leather', coverColor: '#3b2a20', pageStyle: 'cream', pageCount: 2 });
    const open = A.model.newPage(al); A.render.applyTemplate(open, A.render.TEMPLATES.find(t => t.id === 'title'), []);
    const tx = open.elements.filter(e => e.type === 'text'); tx[0].text = 'הסיפור המשפחתי שלנו'; tx[1].text = Array.from(yrs).sort().join(' – ').replace(/ – .* – /, ' … ');
    al.pages = [open].concat(pages); if (al.pages.length % 2) al.pages.push(A.model.newPage(al));
    al.coverPhotoId = photos[0].id;
    await A.db.saveAlbum(al); A.router.go('viewer', { albumId: al.id, autoOpen: true });
  }
  async function undoFlow() {
    const all = (await A.db.albums()).filter(a => a.prevPages);
    if (!all.length) return A.alert('ביטול', 'אין פעולת עוזר לביטול.');
    const al = await new Promise(res => { const box = A.h('div.list'); let close; all.forEach(a => box.appendChild(A.h('button.list-item', { type: 'button', onclick: () => { close(); res(a); } }, '📘 ' + a.name))); A.modal('איזה אלבום להחזיר?', box, [{ label: 'ביטול', value: null }], { onOpen: (c, cl) => { close = cl; } }).then(() => res(null)); });
    if (!al) return;
    al.pages = al.prevPages; delete al.prevPages;
    await A.db.saveAlbum(al); A.viewer.invalidate(); A.toast('↩️ האלבום הוחזר למצבו הקודם');
  }
};

/* ממשק כפילויות */
A.ai.duplicatesUI = async function (ids) {
  let photos = ids ? (await Promise.all(ids.map(i => A.db.photo(i)))).filter(Boolean) : (await A.db.photos()).filter(p => p.kind !== 'signature');
  const groups = A.ai.duplicates(photos);
  if (!groups.length) return A.alert('כפילויות', 'לא נמצאו תמונות כפולות או דומות מאוד. 👍');
  const remove = new Set();
  const box = A.h('div');
  groups.forEach((g, gi) => {
    const row = A.h('div.dup-row', null, A.h('small.muted', null, 'קבוצה ' + (gi + 1) + ' — המומלצת לשמירה מסומנת ⭐'));
    const cells = A.h('div.pgrid.small');
    g.forEach((p, i) => {
      if (i > 0) remove.add(p.id);
      const im = A.h('img', { alt: '' }); A.cache.photoUrl(p, 'thumb').then(u => { if (u) im.src = u; });
      const c = A.h('button.pcell' + (i > 0 ? '.sel' : ''), { type: 'button', onclick: () => { if (remove.has(p.id)) remove.delete(p.id); else remove.add(p.id); c.classList.toggle('sel', remove.has(p.id)); } }, im, i === 0 ? A.h('span.badge', null, '⭐') : null);
      cells.appendChild(c);
    });
    row.appendChild(cells); box.appendChild(row);
  });
  const r = await A.modal('👯 נמצאו ' + groups.length + ' קבוצות דומות', A.h('div', null, A.h('p.muted', null, 'התמונות המסומנות יוסרו. לחצו על תמונה כדי לשנות את הבחירה.'), box),
    [{ label: 'ביטול', value: null }, { label: 'הסרה מהאלבומים בלבד', value: 'albums' }, { label: 'מחיקה לצמיתות', value: 'delete', cls: 'danger' }], { wide: true });
  if (!r || !remove.size) return;
  const list = Array.from(remove);
  if (r === 'delete' && !(await A.confirm('מחיקה לצמיתות', 'למחוק לצמיתות ' + list.length + ' תמונות? לא ניתן לשחזר.', 'מחיקה', true))) return;
  /* הסרה מהאלבומים: מחליפים במקור המומלץ אם אין, אחרת מסירים את האלמנט */
  const keepOf = {}; groups.forEach(g => g.forEach(p => { keepOf[p.id] = g.find(x => !remove.has(x.id)); }));
  for (const al of await A.db.albums()) {
    let ch = false;
    const seen = new Set();
    al.pages.forEach(pg => { pg.elements.forEach(e => { if (e.photoId) seen.add(e.photoId); }); });
    al.pages.forEach(pg => {
      pg.elements = pg.elements.filter(e => {
        if (!e.photoId || !remove.has(e.photoId)) return true;
        ch = true; pg.v = (pg.v || 0) + 1;
        const k = keepOf[e.photoId];
        if (k && !seen.has(k.id)) { e.photoId = k.id; seen.add(k.id); return true; }
        return false;
      });
    });
    if (remove.has(al.coverPhotoId)) { al.coverPhotoId = (keepOf[al.coverPhotoId] || {}).id || null; ch = true; }
    if (ch) await A.db.saveAlbum(al);
  }
  if (r === 'delete') for (const id of list) await A.db.deletePhoto(id);
  A.viewer.invalidate();
  A.toast('✅ ' + list.length + ' כפילויות ' + (r === 'delete' ? 'נמחקו' : 'הוסרו מהאלבומים'));
};

/* ================= זיכרונות ================= */
A.memories = {};
A.memories.onThisDay = async function () {
  const now = new Date();
  return (await A.db.photos()).filter(p => {
    const d = new Date(A.photos.date(p));
    return p.kind !== 'signature' && d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() < now.getFullYear();
  }).sort((a, b) => A.photos.date(a) - A.photos.date(b));
};
A.memories.todayCard = async function () {
  const ps = await A.memories.onThisDay();
  if (!ps.length) return null;
  const yrs = Array.from(new Set(ps.map(p => new Date().getFullYear() - new Date(A.photos.date(p)).getFullYear()))).sort((a, b) => a - b);
  const strip = A.h('div.mem-strip');
  ps.slice(0, 8).forEach(p => { const im = A.h('img', { alt: '' }); A.cache.photoUrl(p, 'thumb').then(u => { if (u) im.src = u; }); strip.appendChild(im); });
  return A.h('button.mem-card', { type: 'button', onclick: () => A.router.go('memories', {}) }, A.h('b', null, '🗓️ היום לפני ' + (yrs[0] === 1 ? 'שנה' : yrs[0] + ' שנים') + (yrs.length > 1 ? ' ועוד' : '')), strip);
};
A.screens.memories = async function () {
  const s = A.h('div.screen');
  s.appendChild(A.header('🗓️ זיכרונות'));
  const ps = await A.memories.onThisDay();
  const sec1 = A.h('section.card', null, A.h('h2', null, 'היום לפני שנה'));
  if (!ps.length) sec1.appendChild(A.h('p.muted', null, 'אין תמונות שצולמו בתאריך הזה בשנים קודמות.'));
  else {
    const byYear = {};
    ps.forEach(p => { const y = new Date(A.photos.date(p)).getFullYear(); (byYear[y] = byYear[y] || []).push(p); });
    Object.keys(byYear).sort((a, b) => b - a).forEach(y => {
      sec1.appendChild(A.h('h3', null, y + ' (לפני ' + (new Date().getFullYear() - y) + ' שנים)'));
      const g = A.h('div.pgrid.small');
      byYear[y].forEach(p => { const im = A.h('img', { alt: '' }); A.cache.photoUrl(p, 'thumb').then(u => { if (u) im.src = u; }); g.appendChild(A.h('button.pcell', { type: 'button', onclick: () => A.viewer.lightbox(p.id) }, im)); });
      sec1.appendChild(g);
    });
    sec1.appendChild(A.h('button.btn.primary', { type: 'button', onclick: async () => {
      const al = A.model.newAlbum({ name: 'היום לפני שנה · ' + A.fmtDate(Date.now()).replace(/ \d{4}$/, ''), category: 'זיכרונות ילדות', pageCount: 2 });
      al.pages = A.ai.layoutPages(ps, { byEvent: true, titles: true, titleFn: g => 'שנת ' + new Date(g.start).getFullYear() });
      al.coverPhotoId = ps[0].id; await A.db.saveAlbum(al); A.router.go('viewer', { albumId: al.id, autoOpen: true });
    } }, '📘 יצירת אלבום מהזיכרונות'));
  }
  const from = A.h('input.inp', { type: 'date' }), to = A.h('input.inp', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const sec2 = A.h('section.card', null, A.h('h2', null, 'אלבום זיכרונות אוטומטי לפי תקופה'),
    A.h('div.row', null, A.h('label.field.half', null, A.h('span', null, 'מתאריך'), from), A.h('label.field.half', null, A.h('span', null, 'עד תאריך'), to)),
    A.h('div.chips', null, [['החודש האחרון', 30], ['השנה האחרונה', 365], ['5 שנים', 1826]].map(([l, d]) => A.h('button.chip', { type: 'button', onclick: () => { from.value = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10); } }, l))),
    A.h('button.btn.primary', { type: 'button', onclick: async () => {
      const f = Date.parse(from.value), t = Date.parse(to.value) + 864e5;
      if (isNaN(f) || isNaN(t)) return A.alert('חסר תאריך', 'בחרו תאריך התחלה וסיום.');
      const sel = (await A.db.photos()).filter(p => p.kind !== 'signature' && A.photos.date(p) >= f && A.photos.date(p) < t);
      if (!sel.length) return A.alert('אין תמונות', 'לא נמצאו תמונות בתקופה הזו.');
      const ok = await A.confirm('אלבום זיכרונות', 'נמצאו ' + sel.length + ' תמונות. ליצור אלבום מעוצב לפי אירועים?', 'יצירה');
      if (!ok) return;
      const al = A.model.newAlbum({ name: 'זיכרונות ' + A.fmtShortDate(f) + '–' + A.fmtShortDate(t - 864e5), category: 'אישי', pageCount: 2 });
      al.pages = A.ai.layoutPages(sel, { byEvent: true, titles: true });
      al.coverPhotoId = sel.slice().sort((a, b) => (b.quality || 0) - (a.quality || 0))[0].id;
      await A.db.saveAlbum(al); A.router.go('viewer', { albumId: al.id, autoOpen: true });
    } }, '✨ יצירת אלבום'));
  s.append(sec1, sec2);
  return s;
};

/* ================= סריקת תמונה מודפסת ================= */
A.scan = {};
A.scan.start = async function () {
  const how = await A.modal('📷 סריקת תמונה ישנה', A.h('p', null, 'צלמו את התמונה המודפסת על משטח בצבע אחיד, ואז כווננו את ארבע הפינות. האפליקציה תיישר את הפרספקטיבה ותחתוך.'),
    [{ label: 'ביטול', value: null }, { label: '📁 מקובץ', value: 'file' }, { label: '📷 צילום', value: 'cam', cls: 'primary' }]);
  if (!how) return;
  const files = await A.pickFiles('image/*', false, how === 'cam');
  if (!files.length) return;
  const src = await A.decode(files[0], 2400);
  const W = src.width, H = src.height;
  let pts = A.scan.autoDetect(src);
  const c = A.h('canvas.scan-cv', { width: W, height: H });
  c.getContext('2d').drawImage(src, 0, 0);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.classList.add('scan-svg');
  const box = A.h('div.scan-box', null, c, svg);
  const draw = () => {
    svg.innerHTML = '<polygon points="' + pts.map(p => p.x + ',' + p.y).join(' ') + '" fill="rgba(80,160,255,0.15)" stroke="#2f8fff" stroke-width="' + W / 200 + '"/>' +
      pts.map((p, i) => '<circle data-i="' + i + '" cx="' + p.x + '" cy="' + p.y + '" r="' + W / 28 + '" fill="rgba(47,143,255,0.55)" stroke="#fff" stroke-width="' + W / 250 + '"/>').join('');
  };
  draw();
  let di = -1;
  const toImg = ev => { const r = svg.getBoundingClientRect(); return { x: A.clamp((ev.clientX - r.left) / r.width * W, 0, W), y: A.clamp((ev.clientY - r.top) / r.height * H, 0, H) }; };
  svg.addEventListener('pointerdown', ev => { svg.setPointerCapture(ev.pointerId); const p = toImg(ev); let bd = Infinity; pts.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; di = i; } }); });
  svg.addEventListener('pointermove', ev => { if (di < 0) return; pts[di] = toImg(ev); draw(); });
  svg.addEventListener('pointerup', () => { di = -1; });
  const enh = A.h('input', { type: 'checkbox', checked: true });
  const r = await A.modal('כוונון פינות', A.h('div', null, box, A.h('label.check', null, enh, ' שחזור צבעים דהויים ושיפור אוטומטי')), [{ label: 'ביטול', value: null }, { label: '↺ כל התמונה', value: 'reset' }, { label: '✂️ יישור ושמירה', value: 'ok', cls: 'primary' }], { wide: true, sticky: true });
  if (r === 'reset') { pts = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }]; }
  if (!r) return;
  const out = A.scan.warp(src, pts);
  if (enh.checked) A.edit.pixels(out, Object.assign(A.edit.defaults(), { fade: true, denoise: 20, sharpness: 20 }));
  const b = await A.canvasToBlob(out, 'image/jpeg', 0.93);
  const rec = await A.photos.addGenerated(b, 'סריקה ' + A.fmtShortDate(Date.now()) + '.jpg', 'scan');
  const add = await A.confirm('✅ הסריקה נשמרה בספרייה', 'להוסיף אותה עכשיו לאלבום?', 'הוספה לאלבום');
  if (add && rec) A.addPhotosToAlbum([rec.id]);
};
/* ניחוש גבולות: האזור השונה מצבע הרקע בשוליים */
A.scan.autoDetect = function (src) {
  const S = 200, k = S / Math.max(src.width, src.height);
  const w = Math.round(src.width * k), h = Math.round(src.height * k);
  const c = A.canvas(w, h), g = c.getContext('2d'); g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let br = 0, bg = 0, bb = 0, n = 0;
  for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) { const i = (y * w + x) * 4; br += d[i]; bg += d[i + 1]; bb += d[i + 2]; n++; }
  for (let y = 0; y < h; y++) for (const x of [0, 1, w - 2, w - 1]) { const i = (y * w + x) * 4; br += d[i]; bg += d[i + 1]; bb += d[i + 2]; n++; }
  br /= n; bg /= n; bb /= n;
  const isFg = (x, y) => { const i = (y * w + x) * 4; return Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb) > 70; };
  /* לכל פינה: הנקודה הקיצונית של החזית בכיוון האלכסון */
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(() => null);
  const score = [(x, y) => -x - y, (x, y) => x - y, (x, y) => x + y, (x, y) => -x + y];
  let cnt = 0;
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) if (isFg(x, y) && isFg(x + 1, y) && isFg(x, y + 1)) {
    cnt++;
    for (let q = 0; q < 4; q++) { const s = score[q](x, y); if (!corners[q] || s > corners[q].s) corners[q] = { s, x, y }; }
  }
  if (cnt < w * h * 0.08 || cnt > w * h * 0.97) { const m = 0.06; return [{ x: src.width * m, y: src.height * m }, { x: src.width * (1 - m), y: src.height * m }, { x: src.width * (1 - m), y: src.height * (1 - m) }, { x: src.width * m, y: src.height * (1 - m) }]; }
  return corners.map(c => ({ x: c.x / k, y: c.y / k }));
};
/* תיקון פרספקטיבה (הומוגרפיה) */
A.scan.warp = function (src, P) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let ow = Math.round(Math.max(dist(P[0], P[1]), dist(P[3], P[2]))), oh = Math.round(Math.max(dist(P[0], P[3]), dist(P[1], P[2])));
  const lim = 2400 / Math.max(ow, oh); if (lim < 1) { ow = Math.round(ow * lim); oh = Math.round(oh * lim); }
  const Hm = homography([{ x: 0, y: 0 }, { x: ow, y: 0 }, { x: ow, y: oh }, { x: 0, y: oh }], P);
  const sc = A.canvas(src.width, src.height); sc.getContext('2d').drawImage(src, 0, 0);
  const sd = sc.getContext('2d').getImageData(0, 0, src.width, src.height).data;
  const out = A.canvas(ow, oh), og = out.getContext('2d'), od = og.createImageData(ow, oh);
  const SW = src.width, SH = src.height;
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const z = Hm[6] * x + Hm[7] * y + 1;
    const sx = (Hm[0] * x + Hm[1] * y + Hm[2]) / z, sy = (Hm[3] * x + Hm[4] * y + Hm[5]) / z;
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    if (x0 < 0 || y0 < 0 || x0 >= SW - 1 || y0 >= SH - 1) continue;
    const fx = sx - x0, fy = sy - y0, o = (y * ow + x) * 4;
    for (let c = 0; c < 3; c++) {
      const i = (y0 * SW + x0) * 4 + c;
      od.data[o + c] = (sd[i] * (1 - fx) + sd[i + 4] * fx) * (1 - fy) + (sd[i + SW * 4] * (1 - fx) + sd[i + SW * 4 + 4] * fx) * fy;
    }
    od.data[o + 3] = 255;
  }
  og.putImageData(od, 0, 0);
  return out;
  function homography(from, to) {
    const Am = [], b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = from[i], { x: u, y: v } = to[i];
      Am.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      Am.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    return solve(Am, b);
  }
  function solve(M, b) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      let mx = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[mx][i])) mx = r;
      [M[i], M[mx]] = [M[mx], M[i]]; [b[i], b[mx]] = [b[mx], b[i]];
      for (let r = i + 1; r < n; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c < n; c++) M[r][c] -= f * M[i][c]; b[r] -= f * b[i]; }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c]; x[i] = s / M[i][i]; }
    return x;
  }
};
