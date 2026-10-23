package it.astax.keycloak.emailcode;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * Magic link (ADR 0019, SIC-05): the token is valid once, for as long as the
 * code, and nothing else gets in. Run by Maven inside the Docker build of the
 * Keycloak image (infra/keycloak/Dockerfile).
 */
class MagicLinkTokensTest {

  /** In-memory store with the same contract as Keycloak's SingleUseObjectProvider. */
  static final class MemoryStore implements MagicLinkTokens.Store, SendLimits.Store {
    final Map<String, Map<String, String>> entries = new HashMap<>();
    final Map<String, Long> lifespans = new HashMap<>();

    @Override
    public Map<String, String> get(String key) {
      return entries.get(key);
    }

    @Override
    public void put(String key, long lifespanSeconds, Map<String, String> notes) {
      entries.put(key, notes);
      lifespans.put(key, lifespanSeconds);
    }

    @Override
    public boolean replace(String key, Map<String, String> notes) {
      return entries.replace(key, notes) != null;
    }

    @Override
    public Map<String, String> remove(String key) {
      return entries.remove(key);
    }
  }

  /** A clock the tests move by hand, like the Clock of the TypeScript code. */
  static final class ManualClock {
    long now = 1_000_000L;

    long get() {
      return now;
    }
  }

  private static final long TTL_SECONDS = 600;

  @Test
  void SIC05_a_valid_link_logs_in_once_and_the_second_use_is_refused() {
    MemoryStore store = new MemoryStore();
    ManualClock clock = new ManualClock();
    MagicLinkTokens tokens = new MagicLinkTokens(store, clock::get);

    String token = tokens.issue("anna@example.test", TTL_SECONDS);
    assertTrue(MagicLinkTokens.TOKEN.matcher(token).matches(), "32 random bytes in base64url");

    Optional<MagicLinkTokens.Claims> first = tokens.consume(token);
    assertTrue(first.isPresent());
    assertEquals("anna@example.test", first.get().email());

    assertTrue(tokens.consume(token).isEmpty(), "a used link is gone");
    assertTrue(store.entries.isEmpty(), "nothing stays in the store after the use");
  }

  @Test
  void SIC05_an_expired_link_is_refused_even_if_the_store_still_has_it() {
    MemoryStore store = new MemoryStore();
    ManualClock clock = new ManualClock();
    MagicLinkTokens tokens = new MagicLinkTokens(store, clock::get);

    String token = tokens.issue("anna@example.test", TTL_SECONDS);
    assertEquals(TTL_SECONDS, store.lifespans.values().iterator().next(), "the store expires it with the code");

    clock.now += TTL_SECONDS * 1000L + 1;
    assertTrue(tokens.consume(token).isEmpty(), "one millisecond late is late");
    assertTrue(store.entries.isEmpty(), "the late attempt consumes it anyway");
  }

  @Test
  void SIC05_a_link_still_valid_one_second_before_expiry() {
    MemoryStore store = new MemoryStore();
    ManualClock clock = new ManualClock();
    MagicLinkTokens tokens = new MagicLinkTokens(store, clock::get);
    String token = tokens.issue("anna@example.test", TTL_SECONDS);
    clock.now += TTL_SECONDS * 1000L - 1000L;
    assertTrue(tokens.consume(token).isPresent());
  }

  @Test
  void SIC06_the_store_holds_a_hash_of_the_token_and_the_address_only_as_a_note() {
    MemoryStore store = new MemoryStore();
    MagicLinkTokens tokens = new MagicLinkTokens(store, () -> 0L);
    String token = tokens.issue("anna@example.test", TTL_SECONDS);
    String key = store.entries.keySet().iterator().next();
    assertFalse(key.contains(token), "the token itself never touches the store");
    assertEquals("astax-magic-link:" + MagicLinkTokens.sha256(token), key);
  }

  @Test
  void SIC05_malformed_unknown_and_revoked_tokens_are_refused() {
    MemoryStore store = new MemoryStore();
    MagicLinkTokens tokens = new MagicLinkTokens(store, () -> 0L);
    assertTrue(tokens.consume(null).isEmpty());
    assertTrue(tokens.consume("").isEmpty());
    assertTrue(tokens.consume("short").isEmpty());
    assertTrue(tokens.consume("A".repeat(43)).isEmpty(), "well formed but never issued");
    assertTrue(tokens.consume("é".repeat(43)).isEmpty(), "not base64url");

    String token = tokens.issue("anna@example.test", TTL_SECONDS);
    tokens.revoke(token);
    assertTrue(tokens.consume(token).isEmpty(), "revoked when the code was typed instead");
  }

  @Test
  void two_links_are_never_the_same() {
    MagicLinkTokens tokens = new MagicLinkTokens(new MemoryStore(), () -> 0L);
    assertNotEquals(
        tokens.issue("anna@example.test", TTL_SECONDS), tokens.issue("anna@example.test", TTL_SECONDS));
  }
}
