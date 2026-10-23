package it.astax.keycloak.emailcode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;

/**
 * One-use tokens of the «magic link» sent with the email code (ADR 0019): the
 * link logs the private customer in with one tap, the code stays as the
 * alternative. A token is 256 random bits; the store keeps only its hash, with
 * the address it belongs to, for as long as the code is valid (otp.validityMinutes).
 * Consuming a token removes it, so a second use finds nothing (same rule as the
 * code: valid once). Pure logic, so it is tested without Keycloak.
 */
final class MagicLinkTokens {

  /** The store of Keycloak (SingleUseObjectProvider) or an in-memory one in tests. */
  interface Store {
    void put(String key, long lifespanSeconds, Map<String, String> notes);

    /** Removes and returns the notes, or null when the key is unknown: atomic, one use. */
    Map<String, String> remove(String key);
  }

  /** What a valid token says. */
  record Claims(String email) {}

  /** A token from the link: base64url of 32 bytes, nothing else. */
  static final Pattern TOKEN = Pattern.compile("^[A-Za-z0-9_-]{43}$");

  private static final String KEY_PREFIX = "astax-magic-link:";
  private static final String NOTE_EMAIL = "email";
  private static final String NOTE_EXPIRES = "expiresAt";
  private static final SecureRandom RANDOM = new SecureRandom();

  private final Store store;
  private final LongSupplier nowMillis;

  MagicLinkTokens(Store store, LongSupplier nowMillis) {
    this.store = store;
    this.nowMillis = nowMillis;
  }

  /** Issues a token for the address, valid for the given seconds; returns the token to put in the link. */
  String issue(String email, long ttlSeconds) {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    long expiresAt = nowMillis.getAsLong() + ttlSeconds * 1000L;
    store.put(key(token), ttlSeconds, Map.of(NOTE_EMAIL, email, NOTE_EXPIRES, Long.toString(expiresAt)));
    return token;
  }

  /**
   * Consumes the token: valid once, and only before its expiry. The expiry is
   * checked here too, not only by the store, so a store that forgets late still
   * refuses an old link. Anything malformed, unknown, used or expired is empty.
   */
  Optional<Claims> consume(String token) {
    if (token == null || !TOKEN.matcher(token).matches()) return Optional.empty();
    Map<String, String> notes = store.remove(key(token));
    if (notes == null) return Optional.empty();
    String email = notes.get(NOTE_EMAIL);
    long expiresAt;
    try {
      expiresAt = Long.parseLong(notes.getOrDefault(NOTE_EXPIRES, "0"));
    } catch (NumberFormatException e) {
      return Optional.empty();
    }
    if (email == null || nowMillis.getAsLong() > expiresAt) return Optional.empty();
    return Optional.of(new Claims(email));
  }

  /** Forgets a token that was not used (the code was typed instead, or the login restarted). */
  void revoke(String token) {
    if (token != null && TOKEN.matcher(token).matches()) store.remove(key(token));
  }

  /** The store key holds a hash, never the token itself (SIC-06). */
  private static String key(String token) {
    return KEY_PREFIX + sha256(token);
  }

  static String sha256(String value) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
