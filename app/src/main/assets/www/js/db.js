/* האלבום שלי — מסד נתונים מקומי (IndexedDB) */
'use strict';
A.db = {
  _db: null,
  NAME: 'my-album-db',
  VER: 1,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const rq = indexedDB.open(this.NAME, this.VER);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains('albums')) d.createObjectStore('albums', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      rq.onsuccess = () => {
        this._db = rq.result;
        this._db.onversionchange = () => { this._db.close(); this._db = null; };
        res(this._db);
      };
      rq.onerror = () => rej(rq.error || new Error('פתיחת מסד הנתונים נכשלה'));
      rq.onblocked = () => rej(new Error('מסד הנתונים חסום'));
    });
  },
  async tx(store, mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      let out;
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error || new Error('שגיאת מסד נתונים'));
      t.onabort = () => rej(t.error || new Error('הפעולה בוטלה (ייתכן שאין מספיק מקום אחסון)'));
      const st = Array.isArray(store) ? store.map(s => t.objectStore(s)) : t.objectStore(store);
      const r = fn(st, t);
      if (r && typeof r.then !== 'function' && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
      else out = r;
    });
  },
  get(store, key) { return this.tx(store, 'readonly', s => s.get(key)); },
  put(store, val, key) { return this.tx(store, 'readwrite', s => key === undefined ? s.put(val) : s.put(val, key)); },
  del(store, key) { return this.tx(store, 'readwrite', s => s.delete(key)); },
  all(store) { return this.tx(store, 'readonly', s => s.getAll()); },
  keys(store) { return this.tx(store, 'readonly', s => s.getAllKeys()); },
  count(store) { return this.tx(store, 'readonly', s => s.count()); },
  clear(store) { return this.tx(store, 'readwrite', s => s.clear()); },

  /* --- אלבומים --- */
  async albums() { const a = await this.all('albums'); return a.sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0)); },
  album(id) { return this.get('albums', id); },
  saveAlbum(al) { al.updatedAt = Date.now(); return this.put('albums', al); },

  /* --- תמונות --- */
  photo(id) { return this.get('photos', id); },
  photos() { return this.all('photos'); },
  savePhoto(p) { return this.put('photos', p); },
  blob(key) { return this.get('blobs', key); },
  putBlob(key, b) { return this.put('blobs', b, key); },
  delBlob(key) { return this.del('blobs', key); },

  async deletePhoto(id) {
    const keys = ['orig', 'disp', 'thumb', 'edit', 'editdisp', 'editthumb'].map(k => id + ':' + k);
    await this.tx(['photos', 'blobs'], 'readwrite', ([p, b]) => { p.delete(id); keys.forEach(k => b.delete(k)); });
    A.cache.dropPhoto(id);
  },
  async deleteMedia(id) {
    await this.tx(['media', 'blobs'], 'readwrite', ([m, b]) => { m.delete(id); b.delete(id + ':data'); b.delete(id + ':poster'); });
  },
  async estimate() {
    try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (e) { /* לא נתמך */ }
    return null;
  }
};

/* מטמון כתובות blob לתצוגה (מונע טעינות כפולות) */
A.cache = {
  urls: new Map(), order: [], MAX: 400,
  async url(key) {
    if (this.urls.has(key)) return this.urls.get(key);
    const b = await A.db.blob(key);
    if (!b) return null;
    const u = URL.createObjectURL(b);
    this.urls.set(key, u); this.order.push(key);
    if (this.order.length > this.MAX) { const k = this.order.shift(); const old = this.urls.get(k); this.urls.delete(k); if (old) setTimeout(() => URL.revokeObjectURL(old), 3000); }
    return u;
  },
  drop(key) { const u = this.urls.get(key); if (u) { this.urls.delete(key); this.order = this.order.filter(k => k !== key); setTimeout(() => URL.revokeObjectURL(u), 3000); } },
  dropPhoto(id) { ['orig', 'disp', 'thumb', 'edit', 'editdisp', 'editthumb'].forEach(k => this.drop(id + ':' + k)); },
  /* הגרסה המוצגת: ערוכה אם קיימת, אחרת מקור */
  async photoUrl(p, size) {
    if (!p) return null;
    const pre = p.hasEdit ? 'edit' : '';
    const key = p.id + ':' + (size === 'thumb' ? (pre ? 'editthumb' : 'thumb') : size === 'orig' ? (pre ? 'edit' : 'orig') : (pre ? 'editdisp' : 'disp'));
    return (await this.url(key)) || (await this.url(p.id + ':' + (size === 'thumb' ? 'thumb' : 'disp')));
  }
};

/* --- מודל אלבום --- */
A.model = {
  COVERS: { leather: 'עור', fabric: 'בד', wood: 'עץ', cardboard: 'קרטון מעוצב' },
  SIZES: { square: 'ריבועי 30×30', landscape: 'לרוחב 30×21', portrait: 'לאורך 21×30' },
  PAPER: { white: 'לבן', cream: 'שמנת', black: 'שחור', kraft: 'נייר קראפט', vintage: 'נייר עתיק' },
  FINISH: { matte: 'מט', glossy: 'מבריק' },
  CATS: ['משפחתי', 'חתונה', 'בר מצווה', 'בת מצווה', 'טיולים', 'ילדים', 'נכדים', 'אירועים', 'חגים', 'זיכרונות ילדות', 'אישי', 'מתנה', 'אחר'],
  COLORS: ['#6b2d2d', '#1f3a5f', '#2f4a32', '#3b2a20', '#f3efe6', '#111111', '#7a5c2e', '#5d3a6b', '#a3485a', '#2c5d63', '#c9a96e', '#8a8f98'],
  aspect(al) { return al.size === 'landscape' ? 30 / 21 : al.size === 'portrait' ? 21 / 30 : 1; },
  paperColor(al) { return ({ white: '#fbfaf7', cream: '#f4ecd8', black: '#1b1b1b', kraft: '#c8a97e', vintage: '#eadcb8' })[al.pageStyle] || '#fbfaf7'; },
  newPage(al) { return { id: A.uid(), bg: null, bgPhotoId: null, elements: [] }; },
  newAlbum(o) {
    const al = Object.assign({
      id: A.uid(), name: 'אלבום חדש', createdAt: Date.now(), updatedAt: Date.now(),
      coverPhotoId: null, coverColor: '#6b2d2d', coverType: 'leather', size: 'square', pageStyle: 'white',
      finish: 'matte', bgPhotoId: null, title: '', dedication: '', category: 'משפחתי', favorite: false,
      locked: false, musicId: null, bookmarks: [], pages: []
    }, o || {});
    const n = Math.max(2, Math.min(200, (o && o.pageCount) || 20));
    if (!al.pages.length) for (let i = 0; i < n; i++) al.pages.push(this.newPage(al));
    if (al.pages.length % 2) al.pages.push(this.newPage(al));
    delete al.pageCount;
    return al;
  },
  photoIds(al) {
    const s = new Set();
    al.pages.forEach(p => { if (p.bgPhotoId) s.add(p.bgPhotoId); p.elements.forEach(e => { if (e.photoId) s.add(e.photoId); }); });
    if (al.coverPhotoId) s.add(al.coverPhotoId);
    if (al.bgPhotoId) s.add(al.bgPhotoId);
    return s;
  },
  mediaIds(al) {
    const s = new Set();
    al.pages.forEach(p => p.elements.forEach(e => { if (e.mediaId) s.add(e.mediaId); }));
    if (al.musicId) s.add(al.musicId);
    return s;
  }
};
