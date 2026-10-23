package it.astax.keycloak.emailcode;

import java.util.Map;
import java.util.function.LongSupplier;

/**
 * Frequency limit of the email code (and so of the magic link, which travels in
 * the same email): at most security.emailCodesPerAddressPerHour codes to one
 * address in the current hour, counted for every address so the answer says
 * nothing about who has an account. The count lives in Keycloak's cluster-wide
 * store under a hash of the address (no address in the key, SIC-06). Pure logic,
 * tested without Keycloak.
 */
final class SendLimits {

  /** The store of Keycloak (SingleUseObjectProvider) or an in-memory one in tests. */
  interface Store {
    Map<String, String> get(String key);

    void put(String key, long lifespanSeconds, Map<String, String> notes);

    boolean replace(String key, Map<String, String> notes);
  }

  private static final String KEY_PREFIX = "astax-email-code:";
  private static final long HOUR_MS = 3_600_000L;

  private final Store store;
  private final LongSupplier nowMillis;

  SendLimits(Store store, LongSupplier nowMillis) {
    this.store = store;
    this.nowMillis = nowMillis;
  }

  /** Counts one more send to the address; false when the hour's limit is already reached. */
  boolean allowSend(String email, int maxPerHour) {
    long hour = nowMillis.getAsLong() / HOUR_MS;
    String key = KEY_PREFIX + MagicLinkTokens.sha256(email) + ":" + hour;
    Map<String, String> current = store.get(key);
    int count = current == null ? 0 : parseOr(current.get("count"), 0);
    if (count >= maxPerHour) return false;
    Map<String, String> next = Map.of("count", Integer.toString(count + 1));
    if (current == null) store.put(key, HOUR_MS / 1000L, next);
    else store.replace(key, next);
    return true;
  }

  static int parseOr(String value, int fallback) {
    try {
      return value == null ? fallback : Integer.parseInt(value);
    } catch (NumberFormatException e) {
      return fallback;
    }
  }
}
