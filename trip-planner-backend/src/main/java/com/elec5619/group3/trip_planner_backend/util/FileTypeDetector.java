package com.elec5619.group3.trip_planner_backend.util;

/**
 * Works out a file's real type from its first bytes ("magic numbers") rather
 * than trusting its name or the type the browser claims. This stops, for
 * example, an HTML or SVG file renamed to .jpg from being stored and served
 * back as if it were an image.
 */
public final class FileTypeDetector {

    public static final String JPEG = "image/jpeg";
    public static final String PNG = "image/png";
    public static final String WEBP = "image/webp";
    public static final String PDF = "application/pdf";

    private FileTypeDetector() {
    }

    /** Returns JPEG, PNG, WEBP or PDF, or null if the bytes are none of these. */
    public static String detect(byte[] data) {
        if (startsWith(data, 0, 0xFF, 0xD8, 0xFF)) {
            return JPEG;
        }
        if (startsWith(data, 0, 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A)) {
            return PNG;
        }
        if (startsWith(data, 0, 'R', 'I', 'F', 'F') && startsWith(data, 8, 'W', 'E', 'B', 'P')) {
            return WEBP;
        }
        if (startsWith(data, 0, '%', 'P', 'D', 'F', '-')) {
            return PDF;
        }
        return null;
    }

    public static boolean isImage(String contentType) {
        return JPEG.equals(contentType) || PNG.equals(contentType) || WEBP.equals(contentType);
    }

    private static boolean startsWith(byte[] data, int offset, int... signature) {
        if (data == null || data.length < offset + signature.length) {
            return false;
        }
        for (int i = 0; i < signature.length; i++) {
            if ((data[offset + i] & 0xFF) != signature[i]) {
                return false;
            }
        }
        return true;
    }
}
