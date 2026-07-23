package com.biopower.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HexFormat;

public final class ApiKeyHasher {

    private static final SecureRandom RANDOM = new SecureRandom();

    private ApiKeyHasher() {
    }

    public static String hash(String rawKey) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawKey.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 not available", ex);
        }
    }

    public static String prefixFor(String rawKey) {
        if (rawKey == null || rawKey.length() < 12) {
            return rawKey;
        }
        return rawKey.substring(0, 12);
    }

    public static String generateRawKey(String label) {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        String suffix = HexFormat.of().formatHex(bytes);
        String safeLabel = label == null ? "key" : label.replaceAll("[^a-zA-Z0-9_-]", "").toLowerCase();
        return "swk_" + safeLabel + "_" + suffix;
    }
}
