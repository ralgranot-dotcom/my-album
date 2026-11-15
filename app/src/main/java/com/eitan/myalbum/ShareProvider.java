package com.eitan.myalbum;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import java.io.File;
import java.io.FileNotFoundException;

/** ספק קבצים פרטי: משתף קבצים מתיקיית המטמון (share/, cam/) בלבד, רק עם אפליקציות שקיבלו הרשאה זמנית. */
public class ShareProvider extends ContentProvider {
    public static final String AUTH = "com.eitan.myalbum.files";

    @Override public boolean onCreate() { return true; }

    File fileFor(Uri uri) throws FileNotFoundException {
        try {
            File root = getContext().getCacheDir().getCanonicalFile();
            String path = uri.getPath();
            if (path == null || !(path.startsWith("/share/") || path.startsWith("/cam/"))) throw new FileNotFoundException();
            File f = new File(root, path).getCanonicalFile();
            if (!f.getPath().startsWith(root.getPath() + File.separator)) throw new FileNotFoundException();
            return f;
        } catch (FileNotFoundException e) { throw e; }
        catch (Exception e) { throw new FileNotFoundException(e.getMessage()); }
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(uri);
        if (mode.contains("w") && !uri.getPath().startsWith("/cam/")) throw new FileNotFoundException("read only");
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.parseMode(mode));
    }

    @Override
    public String getType(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name == null) return "application/octet-stream";
        if (name.endsWith(".apk")) return "application/vnd.android.package-archive";
        if (name.endsWith(".myalbum")) return "application/octet-stream";
        int dot = name.lastIndexOf('.');
        String m = dot >= 0 ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase()) : null;
        return m != null ? m : "application/octet-stream";
    }

    @Override
    public Cursor query(Uri uri, String[] proj, String sel, String[] args, String sort) {
        File f;
        try { f = fileFor(uri); } catch (FileNotFoundException e) { return null; }
        String[] cols = proj != null ? proj : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor c = new MatrixCursor(cols);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
        }
        c.addRow(row);
        return c;
    }

    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
