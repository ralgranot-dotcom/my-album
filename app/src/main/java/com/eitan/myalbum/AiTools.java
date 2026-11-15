package com.eitan.myalbum;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.util.Base64;

import com.google.mlkit.nl.translate.TranslateLanguage;
import com.google.mlkit.nl.translate.Translation;
import com.google.mlkit.nl.translate.Translator;
import com.google.mlkit.nl.translate.TranslatorOptions;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.label.ImageLabel;
import com.google.mlkit.vision.label.ImageLabeler;
import com.google.mlkit.vision.label.ImageLabeling;
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.FloatBuffer;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

/** כלי בינה מלאכותית במכשיר + QR */
class AiTools {
    static final String MODEL_URL = "https://github.com/ralgranot-dotcom/my-album/releases/download/models-1/colorize.onnx";
    final MainActivity a;
    OrtSession colorSession;
    Translator translator;

    AiTools(MainActivity a) { this.a = a; }

    File outDir() { File d = new File(a.getCacheDir(), "ai"); d.mkdirs(); return d; }

    /** שמירת תוצאה כקובץ שהדף טוען דרך /__ai/ */
    String save(Bitmap b, boolean png) throws Exception {
        File[] old = outDir().listFiles();
        if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 600000) f.delete();
        String name = UUID.randomUUID().toString() + (png ? ".png" : ".jpg");
        try (OutputStream o = new FileOutputStream(new File(outDir(), name))) { b.compress(png ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG, png ? 100 : 93, o); }
        return "/__ai/" + name;
    }

    static Bitmap decode(String b64) {
        byte[] d = Base64.decode(b64.substring(b64.indexOf(',') + 1), Base64.DEFAULT);
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inPreferredConfig = Bitmap.Config.ARGB_8888;
        o.inMutable = false;
        return BitmapFactory.decodeByteArray(d, 0, d.length, o);
    }

    /* ---------- הפרדת נושא מהרקע ---------- */
    void segment(String id, String b64) {
        try {
            Bitmap bmp = decode(b64);
            if (bmp == null) { a.callback(id, false, "לא ניתן לקרוא את התמונה"); return; }
            SubjectSegmenter seg = SubjectSegmentation.getClient(new SubjectSegmenterOptions.Builder().enableForegroundBitmap().build());
            seg.process(InputImage.fromBitmap(bmp, 0))
                    .addOnSuccessListener(r -> {
                        try {
                            Bitmap fg = r.getForegroundBitmap();
                            if (fg == null) { a.callback(id, false, "לא זוהה נושא בתמונה"); return; }
                            String path = save(fg, true);
                            a.callback(id, true, path);
                        } catch (Exception e) { a.callback(id, false, "שמירת התוצאה נכשלה"); }
                        seg.close();
                    })
                    .addOnFailureListener(e -> {
                        String m = String.valueOf(e.getMessage());
                        a.callback(id, false, m.toLowerCase().contains("download") || m.toLowerCase().contains("module")
                                ? "רכיב הזיהוי של גוגל יורד כעת למכשיר (פעם אחת). ודאו חיבור לאינטרנט ונסו שוב בעוד דקה."
                                : "הזיהוי נכשל: " + m);
                        seg.close();
                    });
        } catch (Throwable e) { a.callback(id, false, "הזיהוי אינו זמין במכשיר: " + e.getMessage()); }
    }

    /* ---------- זיהוי תוכן התמונה ---------- */
    void labels(String id, String b64, boolean translate) {
        try {
            Bitmap bmp = decode(b64);
            if (bmp == null) { a.callback(id, false, "לא ניתן לקרוא את התמונה"); return; }
            ImageLabeler lab = ImageLabeling.getClient(new ImageLabelerOptions.Builder().setConfidenceThreshold(0.55f).build());
            lab.process(InputImage.fromBitmap(bmp, 0))
                    .addOnSuccessListener(list -> {
                        lab.close();
                        try {
                            JSONArray arr = new JSONArray();
                            StringBuilder sb = new StringBuilder();
                            int n = 0;
                            for (ImageLabel l : list) {
                                if (n++ >= 10) break;
                                JSONObject o = new JSONObject();
                                o.put("en", l.getText());
                                o.put("c", Math.round(l.getConfidence() * 100) / 100.0);
                                arr.put(o);
                                sb.append(l.getText()).append('\n');
                            }
                            if (!translate || arr.length() == 0) { a.callback(id, true, arr.toString()); return; }
                            translateLines(sb.toString().trim(), he -> {
                                try {
                                    if (he != null) {
                                        String[] parts = he.split("\n");
                                        if (parts.length == arr.length()) for (int i = 0; i < parts.length; i++) arr.getJSONObject(i).put("he", parts[i].trim());
                                    }
                                    a.callback(id, true, arr.toString());
                                } catch (Exception e) { a.callback(id, true, arr.toString()); }
                            });
                        } catch (Exception e) { a.callback(id, false, e.getMessage()); }
                    })
                    .addOnFailureListener(e -> { lab.close(); a.callback(id, false, "הזיהוי נכשל: " + e.getMessage()); });
        } catch (Throwable e) { a.callback(id, false, "הזיהוי אינו זמין במכשיר: " + e.getMessage()); }
    }

    interface Str { void on(String s); }

    void translateLines(String text, Str done) {
        try {
            if (translator == null) translator = Translation.getClient(new TranslatorOptions.Builder()
                    .setSourceLanguage(TranslateLanguage.ENGLISH).setTargetLanguage(TranslateLanguage.HEBREW).build());
            translator.downloadModelIfNeeded()
                    .addOnSuccessListener(v -> translator.translate(text).addOnSuccessListener(done::on).addOnFailureListener(e -> done.on(null)))
                    .addOnFailureListener(e -> done.on(null));
        } catch (Throwable e) { done.on(null); }
    }

    /* ---------- צביעת תמונות שחור־לבן ---------- */
    File modelFile() { return new File(a.getFilesDir(), "colorize.onnx"); }

    boolean hasModel() { File f = modelFile(); return f.exists() && f.length() > 1000000; }

    void downloadModel(String id) {
        new Thread(() -> {
            File tmp = new File(a.getFilesDir(), "colorize.part");
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(MODEL_URL).openConnection();
                c.setInstanceFollowRedirects(true);
                c.setRequestProperty("User-Agent", "MyAlbum-App");
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                if (c.getResponseCode() != 200) { a.callback(id, "error", "הורדת המודל נכשלה (קוד " + c.getResponseCode() + ")"); return; }
                long total = c.getContentLengthLong(), got = 0, last = 0;
                try (InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = in.read(buf)) > 0) {
                        o.write(buf, 0, n); got += n;
                        if (total > 0 && got - last > 1500000) { last = got; a.callback(id, "progress", (double) got / total); }
                    }
                }
                if (total > 0 && got != total) { tmp.delete(); a.callback(id, "error", "ההורדה נקטעה, נסו שוב"); return; }
                if (!tmp.renameTo(modelFile())) { a.callback(id, "error", "שמירת המודל נכשלה"); return; }
                a.callback(id, "ok", null);
            } catch (Exception e) { tmp.delete(); a.callback(id, "error", "אין חיבור לאינטרנט"); }
        }).start();
    }

    void colorize(String id, String b64, double strength) {
        new Thread(() -> {
            try {
                if (!hasModel()) { a.callback(id, false, "nomodel"); return; }
                Bitmap src = decode(b64);
                if (src == null) { a.callback(id, false, "לא ניתן לקרוא את התמונה"); return; }
                int w = src.getWidth(), h = src.getHeight();
                int[] px = new int[w * h];
                src.getPixels(px, 0, w, 0, 0, w, h);
                float[] L = new float[w * h];
                float[] lab = new float[3];
                for (int i = 0; i < px.length; i++) { rgb2lab(px[i], lab); L[i] = lab[0]; }
                // קלט המודל: ערוץ הבהירות בגודל 256x256
                final int S = 256;
                float[] in = new float[S * S];
                for (int y = 0; y < S; y++) for (int x = 0; x < S; x++) in[y * S + x] = sample(L, w, h, (x + 0.5f) * w / S - 0.5f, (y + 0.5f) * h / S - 0.5f);
                OrtEnvironment env = OrtEnvironment.getEnvironment();
                if (colorSession == null) colorSession = env.createSession(modelFile().getAbsolutePath(), new OrtSession.SessionOptions());
                String inName = colorSession.getInputNames().iterator().next();
                float[] A, B; int ow, oh;
                try (OnnxTensor t = OnnxTensor.createTensor(env, FloatBuffer.wrap(in), new long[]{1, 1, S, S});
                     OrtSession.Result r = colorSession.run(Collections.singletonMap(inName, t))) {
                    float[][][][] ab = (float[][][][]) r.get(0).getValue();
                    oh = ab[0][0].length; ow = ab[0][0][0].length;
                    A = new float[ow * oh]; B = new float[ow * oh];
                    for (int y = 0; y < oh; y++) for (int x = 0; x < ow; x++) { A[y * ow + x] = ab[0][0][y][x]; B[y * ow + x] = ab[0][1][y][x]; }
                }
                float k = (float) strength;
                int[] res = new int[w * h];
                for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                    float sx = (x + 0.5f) * ow / w - 0.5f, sy = (y + 0.5f) * oh / h - 0.5f;
                    int i = y * w + x;
                    res[i] = lab2rgb(L[i], sample(A, ow, oh, sx, sy) * k, sample(B, ow, oh, sx, sy) * k, Color.alpha(px[i]));
                }
                Bitmap out = Bitmap.createBitmap(res, w, h, Bitmap.Config.ARGB_8888);
                a.callback(id, true, save(out, false));
            } catch (Throwable e) { a.callback(id, false, "הצביעה נכשלה: " + e.getMessage()); }
        }).start();
    }

    static float sample(float[] d, int w, int h, float x, float y) {
        if (x < 0) x = 0; if (y < 0) y = 0; if (x > w - 1) x = w - 1; if (y > h - 1) y = h - 1;
        int x0 = (int) x, y0 = (int) y, x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
        float fx = x - x0, fy = y - y0;
        float t = d[y0 * w + x0] * (1 - fx) + d[y0 * w + x1] * fx, b = d[y1 * w + x0] * (1 - fx) + d[y1 * w + x1] * fx;
        return t * (1 - fy) + b * fy;
    }

    static float lin(float c) { return c <= 0.04045f ? c / 12.92f : (float) Math.pow((c + 0.055f) / 1.055f, 2.4f); }
    static float unlin(float c) { return c <= 0.0031308f ? 12.92f * c : (float) (1.055f * Math.pow(c, 1 / 2.4f) - 0.055f); }
    static float f(float t) { return t > 0.008856f ? (float) Math.cbrt(t) : 7.787f * t + 16f / 116f; }
    static float finv(float t) { return t > 0.2068966f ? t * t * t : (t - 16f / 116f) / 7.787f; }

    static void rgb2lab(int c, float[] o) {
        float r = lin(Color.red(c) / 255f), g = lin(Color.green(c) / 255f), b = lin(Color.blue(c) / 255f);
        float X = (0.412453f * r + 0.357580f * g + 0.180423f * b) / 0.950456f;
        float Y = 0.212671f * r + 0.715160f * g + 0.072169f * b;
        float Z = (0.019334f * r + 0.119193f * g + 0.950227f * b) / 1.088754f;
        float fy = f(Y);
        o[0] = Y > 0.008856f ? 116f * fy - 16f : 903.3f * Y;
        o[1] = 500f * (f(X) - fy);
        o[2] = 200f * (fy - f(Z));
    }

    static int lab2rgb(float L, float A, float B, int alpha) {
        float fy = (L + 16f) / 116f, fx = fy + A / 500f, fz = fy - B / 200f;
        float X = finv(fx) * 0.950456f, Y = finv(fy), Z = finv(fz) * 1.088754f;
        float r = 3.240479f * X - 1.537150f * Y - 0.498535f * Z;
        float g = -0.969256f * X + 1.875992f * Y + 0.041556f * Z;
        float b = 0.055648f * X - 0.204043f * Y + 1.057311f * Z;
        return Color.argb(alpha, cl(unlin(r)), cl(unlin(g)), cl(unlin(b)));
    }

    static int cl(float v) { int i = Math.round(v * 255f); return i < 0 ? 0 : Math.min(255, i); }

    /* ---------- QR ---------- */
    static String qr(String text, int size) {
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
            hints.put(EncodeHintType.MARGIN, 2);
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
            BitMatrix m = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, hints);
            int w = m.getWidth(), h = m.getHeight();
            int[] px = new int[w * h];
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) px[y * w + x] = m.get(x, y) ? 0xFF000000 : 0xFFFFFFFF;
            Bitmap b = Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.PNG, 100, bo);
            return "data:image/png;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) { return null; }
    }

    static String readQr(String b64) {
        try {
            Bitmap b = decode(b64);
            if (b == null) return null;
            int w = b.getWidth(), h = b.getHeight();
            int[] px = new int[w * h];
            b.getPixels(px, 0, w, 0, 0, w, h);
            Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
            hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
            hints.put(DecodeHintType.POSSIBLE_FORMATS, Collections.singletonList(BarcodeFormat.QR_CODE));
            Result r = new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(w, h, px))), hints);
            return r.getText();
        } catch (Exception e) { return null; }
    }
}
