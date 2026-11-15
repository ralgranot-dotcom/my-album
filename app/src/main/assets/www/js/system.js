/* האלבום שלי — אבטחה ונעילה, עדכוני גרסה, בדיקת תקינות */
'use strict';

/* ================= אבטחה ================= */
A.security = {
  unlocked: new Set(),
  pausedAt: 0,
  appPin() { try { return JSON.parse(localStorage.getItem('appPin')); } catch (e) { return null; } },

  /* מקלדת קוד */
  pinPad(title, sub, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      let val = '';
      const dots = A.h('div.pin-dots');
      const msg = A.h('div.pin-msg', null, sub || '');
      const render = () => { dots.innerHTML = ''; for (let i = 0; i < Math.max(4, val.length); i++) dots.appendChild(A.h('span' + (i < val.length ? '.on' : ''))); };
      const keys = A.h('div.pin-keys');
      const press = k => {
        if (k === '⌫') val = val.slice(0, -1);
        else if (k === '✓') { if (val.length >= 4) { done(val); return; } }
        else if (val.length < 8) val += k;
        render();
      };
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].forEach(k => keys.appendChild(A.h('button.pin-key', { type: 'button', onclick: () => press(k) }, k)));
      const extra = A.h('div.pin-extra');
      if (opts.bio) extra.appendChild(A.h('button.btn', { type: 'button', onclick: () => opts.bio(ok => { if (ok) done(true); }) }, '👆 טביעת אצבע'));
      if (opts.cancel !== false) extra.appendChild(A.h('button.btn', { type: 'button', onclick: () => done(null) }, 'ביטול'));
      const scr = A.h('div.lock-screen', { role: 'dialog', 'aria-label': title }, A.h('div.lock-logo', null, '📸'), A.h('h2', null, title), msg, dots, keys, extra);
      document.body.appendChild(scr);
      render();
      const back = () => { if (opts.cancel !== false) done(null); };
      A.backStack.push(back);
      scr.shake = m => { msg.textContent = m; scr.classList.remove('shake'); void scr.offsetWidth; scr.classList.add('shake'); val = ''; render(); };
      function done(v) {
        if (opts.check && v !== null && v !== true) {
          opts.check(v).then(ok => { if (ok) finish(v); else scr.shake('קוד שגוי, נסו שוב'); });
          return;
        }
        finish(v);
      }
      function finish(v) { A.backStack.pop(); scr.remove(); resolve(v); }
      if (opts.autoBio && opts.bio) setTimeout(() => opts.bio(ok => { if (ok) done(true); }), 350);
    });
  },
  bio(cb) {
    if (!A.native.has()) { A.toast('זיהוי ביומטרי זמין רק באפליקציה המותקנת'); return cb(false); }
    const id = A.native.cb((ok, m) => { if (!ok && m) A.toast(m); cb(!!ok); });
    A.native.call('biometric', id, 'פתיחת האלבום שלי');
  },
  async appGate() {
    const rec = this.appPin();
    if (!rec) return true;
    const useBio = A.settings.get('biometric') && A.native.has();
    const r = await this.pinPad('האלבום שלי נעול', 'הקלידו את הקוד האישי', { cancel: false, check: p => A.checkPin(p, rec), bio: useBio ? cb => this.bio(cb) : null, autoBio: useBio });
    return !!r;
  },
  async setupPin() {
    const old = this.appPin();
    if (old) { const ok = await this.pinPad('שינוי קוד', 'הקלידו את הקוד הנוכחי', { check: p => A.checkPin(p, old) }); if (!ok) return; }
    const p1 = await this.pinPad('קוד חדש', 'בחרו קוד של 4–8 ספרות');
    if (!p1) return;
    const p2 = await this.pinPad('אימות', 'הקלידו שוב את הקוד');
    if (p1 !== p2) return A.alert('הקודים אינם תואמים', 'נסו שוב.');
    localStorage.setItem('appPin', JSON.stringify(await A.hashPin(p1)));
    A.toast('🔐 נקבע קוד אישי. האפליקציה תינעל בפתיחה.');
    A.router.refresh();
  },
  async removePin() {
    const old = this.appPin();
    const ok = await this.pinPad('ביטול נעילה', 'הקלידו את הקוד הנוכחי', { check: p => A.checkPin(p, old) });
    if (!ok) return;
    localStorage.removeItem('appPin'); A.settings.set('biometric', false);
    A.toast('🔓 נעילת האפליקציה בוטלה'); A.router.refresh();
  },
  async unlockAlbum(al) {
    if (!al.locked || this.unlocked.has(al.id)) return true;
    const useBio = A.settings.get('biometric') && A.native.has();
    const r = await this.pinPad('🔒 ' + al.name, 'אלבום נעול — הקלידו את קוד האלבום', { check: p => A.checkPin(p, al.pinHash), bio: useBio ? cb => this.bio(cb) : null });
    if (r) this.unlocked.add(al.id);
    return !!r;
  },
  async toggleAlbumLock(al) {
    if (al.locked) {
      if (!(await this.unlockAlbum(al))) return;
      al.locked = false; al.pinHash = null; await A.db.saveAlbum(al); A.toast('🔓 נעילת האלבום בוטלה'); A.router.refresh(); return;
    }
    const p1 = await this.pinPad('נעילת "' + al.name + '"', 'בחרו קוד לאלבום (4–8 ספרות)');
    if (!p1) return;
    const p2 = await this.pinPad('אימות', 'הקלידו שוב את הקוד');
    if (p1 !== p2) return A.alert('הקודים אינם תואמים', 'נסו שוב.');
    al.pinHash = await A.hashPin(p1); al.locked = true; this.unlocked.delete(al.id);
    await A.db.saveAlbum(al); A.toast('🔒 האלבום נעול'); A.router.refresh();
  },
  onPause() { this.pausedAt = Date.now(); },
  async onResume() {
    if (!this.pausedAt) return;
    const away = (Date.now() - this.pausedAt) / 1000;
    this.pausedAt = 0;
    if (this.appPin() && A.settings.get('autoLock') && away > (A.settings.get('lockDelay') || 30) && !A.$('.lock-screen')) {
      this.unlocked.clear();
      await this.appGate();
    }
  },
  privacyInfo() {
    A.alert('🛡️ פרטיות', A.h('ul.info', null,
      A.h('li', null, 'כל התמונות, האלבומים וההקלטות נשמרים במכשיר בלבד, באחסון הפרטי של האפליקציה.'),
      A.h('li', null, 'האפליקציה לא מעלה שום תמונה לענן מעצמה. העלאה מתבצעת רק כשאתם בוחרים: פרסום אלבום לצפייה, אלבום משפחתי משותף או גיבוי לענן.'),
      A.h('li', null, 'אין שימוש בתמונות לאימון מודלים. כל כלי העוזר החכם פועלים במכשיר.'),
      A.h('li', null, 'הגישה לתמונות נעשית רק דרך בורר הקבצים, לתמונות שבחרתם בלבד.'),
      A.h('li', null, 'חיבורים לאינטרנט: בדיקת גרסה חדשה (ניתן לכבות), רכיבי הזיהוי של גוגל במכשיר (הורדה חד־פעמית), ופעולות הענן שבחרתם. לא נשלח מידע פרסומי או סטטיסטי.'),
      A.h('li', null, 'גיבוי לענן מתבצע רק כשאתם בוחרים לשתף קובץ גיבוי — ומומלץ להצפין אותו בסיסמה.')));
  }
};

/* ================= עדכונים ================= */
A.update = {
  REPO: 'ralgranot-dotcom/my-album',
  available: null,
  code() { const c = +A.native.call('getVersionCode'); return c || 0; },
  async fetchLatest() {
    if (A.native.has()) {
      return new Promise(res => {
        const id = A.native.cb((ok, data) => res(ok ? JSON.parse(data) : { error: data || 'אין חיבור' }));
        A.native.call('checkUpdate', id, 'https://api.github.com/repos/' + this.REPO + '/releases/latest');
      });
    }
    try { const r = await fetch('https://api.github.com/repos/' + this.REPO + '/releases/latest'); return await r.json(); }
    catch (e) { return { error: 'אין חיבור לאינטרנט' }; }
  },
  async check(manual) {
    if (!A.native.has()) { if (manual) A.alert('עדכונים', 'בגרסת הדפדפן העדכון נעשה אוטומטית בכל פתיחה עם חיבור לאינטרנט.'); return; }
    const pr = manual ? A.progress('בודק אם יש גרסה חדשה…') : null;
    if (pr) pr.set(0.4);
    const j = await this.fetchLatest();
    if (pr) pr.done();
    if (!j || j.error || !j.tag_name) { if (manual) A.alert('בדיקת עדכונים', 'לא ניתן היה לבדוק כרגע (' + ((j && (j.error || j.message)) || 'שגיאה') + '). ודאו שיש חיבור לאינטרנט.'); return; }
    const remote = parseInt(String(j.tag_name).replace(/\D+/g, ''), 10) || 0;
    const asset = (j.assets || []).find(a => /\.apk$/i.test(a.name));
    const mine = this.code();
    if (asset && remote > mine) {
      this.available = { code: remote, name: (j.name || j.tag_name).replace(/^.*?(\d+\.\d+\.\d+).*$/, '$1'), url: asset.browser_download_url, size: asset.size, notes: j.body || '' };
      const cur = A.router.stack[A.router.stack.length - 1];
      if (cur && cur.name === 'home') A.router.refresh();
      if (manual) this.install();
    } else if (manual) A.alert('✅ הגרסה עדכנית', 'מותקנת הגרסה האחרונה (' + A.VERSION + ', בנייה ' + mine + ').');
  },
  async install() {
    const u = this.available;
    if (!u) return;
    const ok = await A.modal('⬆️ שדרוג לגרסה ' + u.name, A.h('div', null, A.h('p', null, 'גודל ההורדה: ' + A.fmtBytes(u.size)), u.notes ? A.h('pre.notes', null, u.notes.slice(0, 1200)) : null, A.h('p.muted', null, 'האלבומים והתמונות שלכם נשמרים — השדרוג אינו מוחק מידע. מומלץ בכל זאת לגבות מדי פעם.')),
      [{ label: 'לא עכשיו', value: false }, { label: '⬆️ שדרוג', value: true, cls: 'primary' }]);
    if (!ok) return;
    if (!A.native.has()) { window.open(u.url, '_blank'); return; }
    const pr = A.progress('מוריד את הגרסה החדשה…');
    const id = A.native.cb((status, info) => {
      if (status === 'progress') { pr.set(+info || 0, Math.round((+info || 0) * 100) + '%'); return; }
      pr.done();
      if (status === 'perm') A.alert('נדרש אישור חד־פעמי', 'נפתח מסך ההגדרות. הפעילו "התר מהמקור הזה" עבור "האלבום שלי", חזרו לאפליקציה ולחצו שוב על כפתור השדרוג.');
      else if (status === 'ok') A.toast('מסך ההתקנה נפתח — לחצו "עדכון"', 5000);
      else A.alert('השדרוג נכשל', String(info || 'שגיאה לא ידועה'));
    });
    A.native.call('installUpdate', id, u.url);
  }
};

/* ================= בדיקת תקינות ================= */
A.screens.diagnostics = async function () {
  const s = A.h('div.screen');
  s.appendChild(A.header('🔧 בדיקת תקינות'));
  const list = A.h('div.diag');
  const fixBar = A.h('div');
  s.append(A.h('p.muted.pad', null, 'הבדיקה קוראת בלבד. שום תיקון לא יבוצע בלי אישורכם, ושום תמונה לא תימחק.'), list, fixBar);
  const results = [], fixes = [];
  const row = (title) => { const st = A.h('span.st', null, '⏳'), det = A.h('small', null, ''); const r = A.h('div.diag-row', null, st, A.h('div', null, A.h('b', null, title), det)); list.appendChild(r); return (ok, msg) => { st.textContent = ok === true ? '✅' : ok === 'warn' ? '⚠️' : '❌'; det.textContent = msg || ''; results.push({ title, ok, msg }); }; };
  const run = async () => {
    let albums = [], photos = [], media = [], blobKeys = new Set();
    let r = row('מסד הנתונים');
    try { await A.db.open(); albums = await A.db.albums(); photos = await A.db.photos(); media = await A.db.all('media'); blobKeys = new Set(await A.db.keys('blobs')); r(true, albums.length + ' אלבומים, ' + photos.length + ' תמונות, ' + media.length + ' מדיה, ' + blobKeys.size + ' קבצים'); }
    catch (e) { r(false, e.message); return; }

    r = row('שטח אחסון');
    const est = await A.db.estimate();
    if (!est) r('warn', 'המכשיר אינו מדווח על נפח');
    else { const free = est.quota - est.usage; r(free > 300 * 1048576 ? true : 'warn', 'בשימוש ' + A.fmtBytes(est.usage) + ' · פנוי ' + A.fmtBytes(free)); }

    r = row('מנגנון השמירה');
    try { const k = 'diag:' + A.uid(); await A.db.put('meta', { t: Date.now() }, k); const v = await A.db.get('meta', k); await A.db.del('meta', k); r(!!v, v ? 'כתיבה, קריאה ומחיקה תקינות' : 'הקריאה החזירה ערך ריק'); }
    catch (e) { r(false, e.message); }

    r = row('קובצי התמונות');
    const missOrig = [], missDisp = [], missThumb = [];
    photos.forEach(p => { if (!blobKeys.has(p.id + ':orig')) missOrig.push(p); if (!blobKeys.has(p.id + ':disp')) missDisp.push(p); if (!blobKeys.has(p.id + ':thumb')) missThumb.push(p); });
    if (!missOrig.length && !missDisp.length && !missThumb.length) r(true, 'כל ' + photos.length + ' התמונות שלמות');
    else {
      r(missOrig.length ? false : 'warn', (missOrig.length ? missOrig.length + ' קובצי מקור חסרים. ' : '') + (missDisp.length + missThumb.length ? (missDisp.length + missThumb.length) + ' גרסאות תצוגה חסרות.' : ''));
      const rebuild = missDisp.concat(missThumb).filter((p, i, a) => a.indexOf(p) === i && blobKeys.has(p.id + ':orig'));
      if (rebuild.length) fixes.push({ label: 'בנייה מחדש של ' + rebuild.length + ' תמונות ממוזערות (בטוח)', fn: async pr => { for (let i = 0; i < rebuild.length; i++) { pr.set(i / rebuild.length); const b = await A.db.blob(rebuild[i].id + ':orig'); const v = await A.photos.makeVariants(b); await A.db.putBlob(rebuild[i].id + ':disp', v.dispBlob); await A.db.putBlob(rebuild[i].id + ':thumb', v.thumbBlob); A.cache.dropPhoto(rebuild[i].id); } } });
    }

    r = row('טעינת תמונות (דגימה)');
    let bad = 0;
    const sample = photos.slice(0, 25);
    for (const p of sample) { try { const b = await A.db.blob(p.id + ':thumb'); if (!b) continue; await A.decode(b); } catch (e) { bad++; } }
    r(bad ? 'warn' : true, sample.length ? (bad ? bad + ' מתוך ' + sample.length + ' לא נטענו' : sample.length + ' נבדקו ונטענו בהצלחה') : 'אין תמונות לבדיקה');

    r = row('תקינות קובצי האלבומים');
    const pSet = new Set(photos.map(p => p.id)), mSet = new Set(media.map(m => m.id));
    let broken = 0, refs = 0, odd = 0;
    albums.forEach(a => {
      if (!Array.isArray(a.pages)) { broken++; return; }
      if (a.pages.length % 2) odd++;
      a.pages.forEach(pg => (pg.elements || []).forEach(e => { if (e.photoId && !pSet.has(e.photoId)) refs++; if (e.mediaId && !mSet.has(e.mediaId)) refs++; }));
      if (a.coverPhotoId && !pSet.has(a.coverPhotoId)) refs++;
    });
    r(broken ? false : refs || odd ? 'warn' : true, broken ? broken + ' אלבומים פגומים' : refs || odd ? (refs ? refs + ' הפניות לקבצים שאינם קיימים. ' : '') + (odd ? odd + ' אלבומים עם מספר עמודים אי־זוגי.' : '') : 'כל האלבומים תקינים');
    if (refs || odd) fixes.push({ label: 'ניקוי הפניות לקבצים חסרים ותיקון מספר עמודים (התמונות עצמן לא נמחקות)', fn: async () => {
      for (const a of albums) {
        if (!Array.isArray(a.pages)) continue;
        a.pages.forEach(pg => (pg.elements || []).forEach(e => { if (e.photoId && !pSet.has(e.photoId)) e.photoId = null; }));
        a.pages.forEach(pg => { pg.elements = (pg.elements || []).filter(e => !e.mediaId || mSet.has(e.mediaId)); });
        if (a.coverPhotoId && !pSet.has(a.coverPhotoId)) a.coverPhotoId = null;
        if (a.musicId && !mSet.has(a.musicId)) a.musicId = null;
        if (a.pages.length % 2) a.pages.push(A.model.newPage(a));
        await A.db.put('albums', a);
      }
    } });

    r = row('קבצים חסרים במדיה');
    const missM = media.filter(m => !blobKeys.has(m.id + ':data'));
    r(missM.length ? false : true, missM.length ? missM.length + ' קובצי וידאו/שמע חסרים' : media.length + ' קובצי מדיה תקינים');

    r = row('קבצים יתומים');
    const known = new Set(); photos.forEach(p => ['orig', 'disp', 'thumb', 'edit', 'editdisp', 'editthumb'].forEach(k => known.add(p.id + ':' + k))); media.forEach(m => { known.add(m.id + ':data'); known.add(m.id + ':poster'); });
    const orphans = Array.from(blobKeys).filter(k => !known.has(k));
    r(orphans.length ? 'warn' : true, orphans.length ? orphans.length + ' קבצים ללא רשומה (תופסים מקום)' : 'אין');
    if (orphans.length) fixes.push({ label: 'פינוי ' + orphans.length + ' קבצים יתומים שאינם שייכים לשום תמונה', danger: true, fn: async () => { for (const k of orphans) await A.db.delBlob(k); } });

    r = row('תקינות הגיבויים');
    const last = +localStorage.getItem('lastBackup') || 0;
    try {
      const sink = { parts: [], async write(u8) { this.parts.push(u8); } };
      const w = await A.backup.writer(sink, 'diag-test');
      await w.add('t.json', new TextEncoder().encode('{"ok":1}')); await w.end();
      const f = new File(sink.parts, 't.myalbum');
      const rd = await A.backup.reader(f, 'diag-test'); const e = await rd.next(); const txt = new TextDecoder().decode(await e.read());
      const ok = txt === '{"ok":1}';
      r(ok ? (last && Date.now() - last < 30 * 864e5 ? true : 'warn') : false, (ok ? 'מנגנון הגיבוי וההצפנה תקין. ' : 'בדיקת ההצפנה נכשלה. ') + (last ? 'גיבוי אחרון: ' + A.fmtDate(last) : 'עדיין לא נוצר גיבוי — מומלץ ליצור.'));
    } catch (e) { r(false, e.message); }

    r = row('מנוע הדפדוף');
    if (A.router.stack.some(x => x.name === 'viewer')) r('warn', 'דלג — האלבום פתוח כרגע');
    else { const t = await A.viewer.selfTest(); r(t.ok ? true : false, t.ok ? '3 דפדופים בוצעו (' + t.ms + ' מ״ש)' : 'שגיאה: ' + (t.err || 'הדפדוף לא הושלם')); }

    r = row('חיבור לענן ולאלבומים משותפים');
    const shared = albums.filter(a => a.share).length, pubd = albums.filter(a => a.pub).length;
    try { await A.cloud.call('ping'); r(true, 'השרת זמין · ' + shared + ' אלבומים משותפים · ' + pubd + ' מפורסמים'); }
    catch (e) { r(shared || pubd || localStorage.getItem('cloudBackup') ? 'warn' : true, (shared || pubd ? 'אין חיבור כרגע (' + e.message + ') — הסנכרון יתבצע כשיחזור החיבור' : 'לא בשימוש · אין חיבור כרגע')); }

    r = row('גישה לתמונות במכשיר');
    r(true, 'האפליקציה משתמשת בבורר הקבצים של המערכת ואינה דורשת הרשאת גישה לכל הגלריה');

    /* סיכום */
    const errs = results.filter(x => x.ok === false).length, warns = results.filter(x => x.ok === 'warn').length;
    fixBar.appendChild(A.h('section.card', null, A.h('h2', null, errs ? '❌ נמצאו ' + errs + ' תקלות' : warns ? '⚠️ תקין, עם ' + warns + ' הערות' : '✅ הכול תקין'),
      fixes.length ? A.h('p', null, 'תיקונים אפשריים (כל אחד באישור נפרד):') : null,
      ...fixes.map(f => A.h('button.btn' + (f.danger ? '.danger' : '.primary'), { type: 'button', onclick: async () => {
        if (!(await A.confirm('אישור תיקון', f.label + '?', 'ביצוע', f.danger))) return;
        const pr = A.progress('מתקן…');
        try { await f.fn(pr); pr.done(); A.viewer.invalidate(); A.toast('✅ בוצע'); A.router.refresh(); } catch (e) { pr.done(); A.alert('התיקון נכשל', e.message); }
      } }, '🔧 ' + f.label)),
      A.h('button.btn', { type: 'button', onclick: async () => { const txt = 'דוח בדיקת תקינות — האלבום שלי ' + A.VERSION + '\n' + new Date().toLocaleString('he-IL') + '\n\n' + results.map(x => (x.ok === true ? '✅' : x.ok === 'warn' ? '⚠️' : '❌') + ' ' + x.title + ': ' + (x.msg || '')).join('\n'); await A.saveFile(new Blob([txt], { type: 'text/plain' }), 'דוח_תקינות.txt', 'share'); } }, '📤 שיתוף הדוח')));
  };
  setTimeout(run, 50);
  return s;
};
