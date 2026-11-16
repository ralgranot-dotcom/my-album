package com.eitan.myalbum;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.biometrics.BiometricPrompt;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executor;

/** מעטפת אנדרואיד ל"האלבום שלי": מציגה את האפליקציה ומספקת גישה לקבצים, שיתוף, ביומטריה ועדכונים. */
public class MainActivity extends Activity {
    static final String HOST = "app.myalbum.local";
    static final int REQ_FILE = 11, REQ_AUDIO = 12;

    WebView web;
    AiTools ai;
    Ota ota;
    ValueCallback<Uri[]> fileCb;
    Uri cameraUri;
    PermissionRequest pendingPerm;
    final Map<String, OutFile> outFiles = new HashMap<>();

    static class OutFile { File file; String name; String mime; OutputStream out; }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.parseColor("#2b1d12"));
        getWindow().setNavigationBarColor(Color.parseColor("#1b140e"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#f6f1e8"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
                try {
                    if (path.startsWith("/__ai/")) {
                        File f = new File(new File(getCacheDir(), "ai"), new File(path).getName());
                        WebResourceResponse r = new WebResourceResponse(path.endsWith(".png") ? "image/png" : "image/jpeg", null, new FileInputStream(f));
                        Map<String, String> h = new HashMap<>();
                        h.put("Cache-Control", "no-store");
                        r.setResponseHeaders(h);
                        return r;
                    }
                    InputStream in = ota.open(path);
                    if (in == null) in = getAssets().open("www" + path);
                    String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
                    String mime = ext.equals("js") ? "application/javascript" : ext.equals("css") ? "text/css" : ext.equals("html") ? "text/html"
                            : ext.equals("svg") ? "image/svg+xml" : ext.equals("png") ? "image/png" : ext.equals("json") ? "application/json" : "application/octet-stream";
                    WebResourceResponse r = new WebResourceResponse(mime, "utf-8", in);
                    Map<String, String> h = new HashMap<>();
                    h.put("Cache-Control", "no-cache");
                    r.setResponseHeaders(h);
                    return r;
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                String[] types = p.getAcceptTypes();
                String type = (types != null && types.length > 0 && types[0] != null && !types[0].isEmpty()) ? types[0] : "*/*";
                try {
                    if (p.isCaptureEnabled() && type.startsWith("image")) {
                        File dir = new File(getCacheDir(), "cam");
                        dir.mkdirs();
                        String name = "photo_" + System.currentTimeMillis() + ".jpg";
                        new File(dir, name).createNewFile();
                        cameraUri = Uri.parse("content://" + ShareProvider.AUTH + "/cam/" + name);
                        Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        i.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                        i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        i.setClipData(ClipData.newRawUri("", cameraUri));
                        startActivityForResult(i, REQ_FILE);
                        return true;
                    }
                    cameraUri = null;
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(type);
                    if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(Intent.createChooser(i, "בחירת קבצים"), REQ_FILE);
                } catch (Exception e) {
                    fileCb.onReceiveValue(null);
                    fileCb = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest req) {
                runOnUiThread(() -> {
                    boolean audio = false;
                    for (String r : req.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) audio = true;
                    if (!audio) { req.deny(); return; }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        req.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        pendingPerm = req;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_AUDIO);
                    }
                });
            }
        });

        ai = new AiTools(this);
        ota = new Ota(this);
        ota.startup();
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        setContentView(web);
        if (b != null) web.restoreState(b);
        else web.loadUrl("https://" + HOST + "/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == REQ_AUDIO && pendingPerm != null) {
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) pendingPerm.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else pendingPerm.deny();
            pendingPerm = null;
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code != REQ_FILE || fileCb == null) return;
        Uri[] out = null;
        if (result == RESULT_OK) {
            if (cameraUri != null) out = new Uri[]{cameraUri};
            else if (data != null) {
                ClipData cd = data.getClipData();
                if (cd != null && cd.getItemCount() > 0) {
                    out = new Uri[cd.getItemCount()];
                    for (int i = 0; i < cd.getItemCount(); i++) out[i] = cd.getItemAt(i).getUri();
                } else if (data.getData() != null) out = new Uri[]{data.getData()};
            }
        }
        fileCb.onReceiveValue(out);
        fileCb = null;
        cameraUri = null;
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.App && App.onBack()) ? 'yes' : 'no'", v -> {
            if (v == null || !v.contains("yes")) moveTaskToBack(true);
        });
    }

    @Override
    protected void onPause() { super.onPause(); js("window.App && App.onPause()"); }

    @Override
    protected void onResume() { super.onResume(); js("window.App && App.onResume()"); }

    void js(String code) { runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); }); }

    void callback(String id, Object a, Object b) {
        String sa = a instanceof String ? JSONObject.quote((String) a) : String.valueOf(a);
        String sb = b == null ? "null" : b instanceof String ? JSONObject.quote((String) b) : String.valueOf(b);
        js("window.__nativeCb && window.__nativeCb(" + JSONObject.quote(id) + "," + sa + "," + sb + ")");
    }

    Uri shareUri(File f) { return Uri.parse("content://" + ShareProvider.AUTH + "/share/" + Uri.encode(f.getName())); }

    /** גשר JavaScript */
    class Bridge {
        @JavascriptInterface
        public int getVersionCode() {
            try {
                PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                return (int) pi.getLongVersionCode();
            } catch (Exception e) { return 0; }
        }

        @JavascriptInterface
        public String getVersionName() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public String beginFile(String name, String mime) {
            try {
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                String id = UUID.randomUUID().toString();
                OutFile o = new OutFile();
                o.name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
                o.mime = mime;
                File sub = new File(dir, id);
                sub.mkdirs();
                o.file = new File(sub, o.name);
                o.out = new FileOutputStream(o.file);
                synchronized (outFiles) { outFiles.put(id, o); }
                return id;
            } catch (Exception e) { return null; }
        }

        @JavascriptInterface
        public boolean appendChunk(String id, String b64) {
            OutFile o;
            synchronized (outFiles) { o = outFiles.get(id); }
            if (o == null) return false;
            try { o.out.write(Base64.decode(b64, Base64.DEFAULT)); return true; } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public void abortFile(String id) {
            OutFile o;
            synchronized (outFiles) { o = outFiles.remove(id); }
            if (o == null) return;
            try { o.out.close(); } catch (Exception ignored) { }
            o.file.delete();
        }

        @JavascriptInterface
        public String finishFile(String id, String action) {
            OutFile o;
            synchronized (outFiles) { o = outFiles.remove(id); }
            if (o == null) return "ERR: no file";
            try { o.out.close(); } catch (Exception e) { return "ERR: " + e.getMessage(); }
            try {
                if ("save".equals(action)) return saveToDownloads(o);
                final Uri uri = Uri.parse("content://" + ShareProvider.AUTH + "/share/" + Uri.encode(o.file.getParentFile().getName()) + "/" + Uri.encode(o.name));
                runOnUiThread(() -> {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(o.mime == null || o.mime.isEmpty() ? "application/octet-stream" : o.mime);
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.setClipData(ClipData.newRawUri(o.name, uri));
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    if ("email".equals(action)) {
                        send.putExtra(Intent.EXTRA_SUBJECT, "📸 " + o.name);
                        send.putExtra(Intent.EXTRA_TEXT, "נשלח מהאפליקציה \"האלבום שלי\"");
                    }
                    if ("whatsapp".equals(action)) {
                        send.setPackage("com.whatsapp");
                        try { startActivity(send); return; } catch (ActivityNotFoundException e) {
                            send.setPackage("com.whatsapp.w4b");
                            try { startActivity(send); return; } catch (ActivityNotFoundException e2) { send.setPackage(null); }
                        }
                    }
                    startActivity(Intent.createChooser(send, "שיתוף").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
                });
                return "OK";
            } catch (Exception e) { return "ERR: " + e.getMessage(); }
        }

        @JavascriptInterface
        public void setSecure(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            });
        }

        @JavascriptInterface
        public int getNativeApi() { return Ota.NATIVE_API; }

        @JavascriptInterface
        public String otaInfo() { if (!ota.active) return ""; org.json.JSONObject i = ota.info(); return i == null ? "" : i.toString(); }

        @JavascriptInterface
        public void otaApply(String id, String url, String sha, int code, String name, int nativeNeeded) { ota.apply(id, url, sha, code, name, nativeNeeded); }

        @JavascriptInterface
        public void otaReset() { ota.reset(); }

        @JavascriptInterface
        public void bootOk() { ota.bootOk(); }

        @JavascriptInterface
        public boolean otaRolledBack() { boolean r = ota.rolledBack; ota.rolledBack = false; return r; }

        @JavascriptInterface
        public void reloadApp() { runOnUiThread(() -> { web.clearCache(false); web.reload(); }); }

        @JavascriptInterface
        public boolean aiAvailable() { return true; }

        @JavascriptInterface
        public void aiSegment(String id, String b64) { runOnUiThread(() -> ai.segment(id, b64)); }

        @JavascriptInterface
        public void aiLabels(String id, String b64, boolean translate) { runOnUiThread(() -> ai.labels(id, b64, translate)); }

        @JavascriptInterface
        public void aiTranslate(String id, String text) { runOnUiThread(() -> ai.translateLines(text, he -> callback(id, he != null, he))); }

        @JavascriptInterface
        public boolean aiHasColorModel() { return ai.hasModel(); }

        @JavascriptInterface
        public void aiDownloadColorModel(String id) { ai.downloadModel(id); }

        @JavascriptInterface
        public void aiColorize(String id, String b64, double strength) { ai.colorize(id, b64, strength); }

        @JavascriptInterface
        public String qrMake(String text, int size) { return AiTools.qr(text, size); }

        @JavascriptInterface
        public String qrRead(String b64) { return AiTools.readQr(b64); }

        @JavascriptInterface
        public void biometric(String id, String title) {
            runOnUiThread(() -> {
                try {
                    Executor ex = getMainExecutor();
                    BiometricPrompt bp = new BiometricPrompt.Builder(MainActivity.this)
                            .setTitle(title)
                            .setSubtitle("זיהוי באמצעות טביעת אצבע או פנים")
                            .setNegativeButton("ביטול", ex, (d, w) -> callback(id, false, null))
                            .build();
                    bp.authenticate(new CancellationSignal(), ex, new BiometricPrompt.AuthenticationCallback() {
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) { callback(id, true, null); }
                        @Override public void onAuthenticationError(int code, CharSequence msg) {
                            if (code == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED || code == BiometricPrompt.BIOMETRIC_ERROR_CANCELED) callback(id, false, null);
                            else callback(id, false, String.valueOf(msg));
                        }
                    });
                } catch (Exception e) { callback(id, false, "זיהוי ביומטרי אינו זמין במכשיר"); }
            });
        }

        @JavascriptInterface
        public void checkUpdate(String id, String url) {
            new Thread(() -> {
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setRequestProperty("Accept", "application/vnd.github+json");
                    c.setRequestProperty("User-Agent", "MyAlbum-App");
                    c.setConnectTimeout(12000);
                    c.setReadTimeout(15000);
                    int code = c.getResponseCode();
                    if (code != 200) { callback(id, false, "קוד " + code); return; }
                    InputStream in = c.getInputStream();
                    java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[16384]; int n;
                    while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                    in.close();
                    callback(id, true, bo.toString("UTF-8"));
                } catch (Exception e) { callback(id, false, "אין חיבור לאינטרנט"); }
            }).start();
        }

        @JavascriptInterface
        public void installUpdate(String id, String url) {
            if (!getPackageManager().canRequestPackageInstalls()) {
                runOnUiThread(() -> {
                    try { startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); }
                    catch (Exception ignored) { }
                });
                callback(id, "perm", null);
                return;
            }
            new Thread(() -> {
                try {
                    File dir = new File(getCacheDir(), "share/update");
                    dir.mkdirs();
                    File apk = new File(dir, "my-album-update.apk");
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setInstanceFollowRedirects(true);
                    c.setRequestProperty("User-Agent", "MyAlbum-App");
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(30000);
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String loc = c.getHeaderField("Location");
                        c = (HttpURLConnection) new URL(loc).openConnection();
                        c.setRequestProperty("User-Agent", "MyAlbum-App");
                        code = c.getResponseCode();
                    }
                    if (code != 200) { callback(id, "error", "ההורדה נכשלה (קוד " + code + ")"); return; }
                    long total = c.getContentLengthLong();
                    InputStream in = c.getInputStream();
                    OutputStream out = new FileOutputStream(apk);
                    byte[] buf = new byte[65536]; int n; long got = 0, lastReport = 0;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n); got += n;
                        if (total > 0 && got - lastReport > total / 50) { lastReport = got; callback(id, "progress", String.valueOf((double) got / total)); }
                    }
                    out.close(); in.close();
                    Uri uri = Uri.parse("content://" + ShareProvider.AUTH + "/share/update/" + apk.getName());
                    runOnUiThread(() -> {
                        Intent i = new Intent(Intent.ACTION_VIEW);
                        i.setDataAndType(uri, "application/vnd.android.package-archive");
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        try { startActivity(i); callback(id, "ok", null); }
                        catch (Exception e) { callback(id, "error", "לא ניתן לפתוח את מסך ההתקנה"); }
                    });
                } catch (Exception e) { callback(id, "error", "ההורדה נכשלה: " + e.getMessage()); }
            }).start();
        }
    }

    /** שמירה בתיקיית ההורדות: Download/האלבום שלי */
    String saveToDownloads(OutFile o) throws Exception {
        ContentResolver cr = getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, o.name);
        String mime = o.mime;
        if (mime == null || mime.isEmpty()) {
            String ext = MimeTypeMap.getFileExtensionFromUrl(o.name);
            mime = ext != null ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) : null;
            if (mime == null) mime = "application/octet-stream";
        }
        v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/האלבום שלי");
        v.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
        if (uri == null) throw new Exception("לא ניתן ליצור קובץ בהורדות");
        try (InputStream in = new FileInputStream(o.file); OutputStream out = cr.openOutputStream(uri)) {
            byte[] buf = new byte[262144]; int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
        v.clear();
        v.put(MediaStore.MediaColumns.IS_PENDING, 0);
        cr.update(uri, v, null, null);
        o.file.delete();
        if (o.file.getParentFile() != null) o.file.getParentFile().delete();
        return "הורדות ← האלבום שלי ← " + o.name;
    }
}
