package com.eitan.myalbum;

import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * עדכון מהיר בלי התקנת קובץ: הורדת חבילת הממשק (www.zip) מהגרסה החדשה ביותר,
 * בדיקת חתימת SHA-256, פריסה לתיקייה פרטית והחלפה. עדכוני רכיבי מערכת עדיין דורשים APK.
 */
class Ota {
    /** יש להעלות את המספר בכל שינוי בקוד ה-Java (גשר/יכולות מערכת) */
    static final int NATIVE_API = 2;
    final MainActivity a;
    volatile boolean active;
    boolean rolledBack;

    Ota(MainActivity a) { this.a = a; }

    File dir() { return new File(a.getFilesDir(), "ota"); }
    SharedPreferences prefs() { return a.getSharedPreferences("ota", 0); }

    int apkCode() {
        try { return (int) a.getPackageManager().getPackageInfo(a.getPackageName(), 0).getLongVersionCode(); } catch (Exception e) { return 0; }
    }

    JSONObject info() {
        try {
            File f = new File(dir(), "ota.json");
            if (!f.exists() || !new File(dir(), "index.html").exists()) return null;
            byte[] b = new byte[(int) f.length()];
            try (InputStream in = new FileInputStream(f)) { int o = 0, n; while (o < b.length && (n = in.read(b, o, b.length - o)) > 0) o += n; }
            return new JSONObject(new String(b, "UTF-8"));
        } catch (Exception e) { return null; }
    }

    /** בהפעלה: מבטלים חבילה ישנה מה-APK, או חבילה שלא הצליחה לעלות פעמיים ברצף */
    void startup() {
        SharedPreferences p = prefs();
        JSONObject i = info();
        if (i == null) { active = false; return; }
        int fails = p.getInt("fails", 0);
        if (i.optInt("code") <= apkCode() || i.optInt("native", 0) > NATIVE_API || fails >= 2) {
            rolledBack = fails >= 2;
            delete(dir());
            p.edit().putInt("fails", 0).apply();
            active = false;
            return;
        }
        p.edit().putInt("fails", fails + 1).apply();
        active = true;
    }

    void bootOk() { prefs().edit().putInt("fails", 0).apply(); }

    /** קובץ מהחבילה המעודכנת, או null כדי להשתמש בקבצי ה-APK */
    InputStream open(String path) {
        if (!active) return null;
        try {
            File root = dir().getCanonicalFile();
            File f = new File(root, path).getCanonicalFile();
            if (!f.getPath().startsWith(root.getPath() + File.separator) || !f.isFile()) return null;
            return new FileInputStream(f);
        } catch (Exception e) { return null; }
    }

    void apply(String id, String zipUrl, String sha, int code, String name, int nativeNeeded) {
        new Thread(() -> {
            File zip = new File(a.getCacheDir(), "www_update.zip");
            File tmp = new File(a.getFilesDir(), "ota_tmp");
            try {
                if (nativeNeeded > NATIVE_API) { a.callback(id, "error", "העדכון דורש התקנה מלאה"); return; }
                HttpURLConnection c = (HttpURLConnection) new URL(zipUrl).openConnection();
                c.setInstanceFollowRedirects(true);
                c.setRequestProperty("User-Agent", "MyAlbum-App");
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                if (c.getResponseCode() != 200) { a.callback(id, "error", "ההורדה נכשלה (קוד " + c.getResponseCode() + ")"); return; }
                long total = c.getContentLengthLong(), got = 0;
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                try (InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(zip)) {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = in.read(buf)) > 0) {
                        o.write(buf, 0, n); md.update(buf, 0, n); got += n;
                        if (total > 0) a.callback(id, "progress", 0.8 * got / total);
                    }
                }
                StringBuilder hex = new StringBuilder();
                for (byte x : md.digest()) hex.append(String.format("%02x", x));
                if (sha == null || !hex.toString().equalsIgnoreCase(sha)) { zip.delete(); a.callback(id, "error", "בדיקת שלמות העדכון נכשלה — העדכון לא הוחל"); return; }
                delete(tmp);
                tmp.mkdirs();
                File root = tmp.getCanonicalFile();
                try (ZipInputStream zin = new ZipInputStream(new FileInputStream(zip))) {
                    ZipEntry e; byte[] buf = new byte[65536];
                    while ((e = zin.getNextEntry()) != null) {
                        File out = new File(root, e.getName()).getCanonicalFile();
                        if (!out.getPath().startsWith(root.getPath() + File.separator)) throw new Exception("נתיב לא חוקי בעדכון");
                        if (e.isDirectory()) { out.mkdirs(); continue; }
                        out.getParentFile().mkdirs();
                        try (OutputStream o = new FileOutputStream(out)) { int n; while ((n = zin.read(buf)) > 0) o.write(buf, 0, n); }
                    }
                }
                zip.delete();
                if (!new File(tmp, "index.html").isFile() || !new File(tmp, "js/app.js").isFile()) { delete(tmp); a.callback(id, "error", "חבילת העדכון חסרה קבצים — העדכון לא הוחל"); return; }
                JSONObject j = new JSONObject();
                j.put("code", code); j.put("name", name); j.put("native", nativeNeeded); j.put("at", System.currentTimeMillis());
                try (OutputStream o = new FileOutputStream(new File(tmp, "ota.json"))) { o.write(j.toString().getBytes("UTF-8")); }
                active = false;
                delete(dir());
                if (!tmp.renameTo(dir())) { a.callback(id, "error", "החלפת הקבצים נכשלה"); return; }
                prefs().edit().putInt("fails", 0).apply();
                active = true;
                a.callback(id, "ok", null);
            } catch (Exception e) {
                zip.delete(); delete(tmp);
                a.callback(id, "error", e.getMessage() != null && e.getMessage().matches(".*[֐-׿].*") ? e.getMessage() : "אין חיבור לאינטרנט");
            }
        }).start();
    }

    void reset() { active = false; delete(dir()); prefs().edit().putInt("fails", 0).apply(); }

    static void delete(File f) {
        if (f == null || !f.exists()) return;
        File[] k = f.listFiles();
        if (k != null) for (File x : k) delete(x);
        f.delete();
    }
}
