package it.astax.keycloak.emailcode;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * security.emailCodesPerAddressPerHour (SIC-05): the limit of the code is the
 * limit of the link, because the link travels in the same email.
 */
class SendLimitsTest {

  @Test
  void SIC05_the_hourly_limit_stops_the_next_email_and_so_the_next_link() {
    MagicLinkTokensTest.MemoryStore store = new MagicLinkTokensTest.MemoryStore();
    MagicLinkTokensTest.ManualClock clock = new MagicLinkTokensTest.ManualClock();
    SendLimits limits = new SendLimits(store, clock::get);

    assertTrue(limits.allowSend("anna@example.test", 2));
    assertTrue(limits.allowSend("anna@example.test", 2));
    assertFalse(limits.allowSend("anna@example.test", 2), "third code in the hour: refused");
    assertTrue(limits.allowSend("bruno@example.test", 2), "another address has its own count");
  }

  @Test
  void SIC05_the_count_starts_again_in_the_next_hour() {
    MagicLinkTokensTest.MemoryStore store = new MagicLinkTokensTest.MemoryStore();
    MagicLinkTokensTest.ManualClock clock = new MagicLinkTokensTest.ManualClock();
    SendLimits limits = new SendLimits(store, clock::get);
    assertTrue(limits.allowSend("anna@example.test", 1));
    assertFalse(limits.allowSend("anna@example.test", 1));
    clock.now += 3_600_000L;
    assertTrue(limits.allowSend("anna@example.test", 1));
  }

  @Test
  void SIC06_the_store_key_has_no_address_in_it() {
    MagicLinkTokensTest.MemoryStore store = new MagicLinkTokensTest.MemoryStore();
    new SendLimits(store, () -> 0L).allowSend("anna@example.test", 5);
    String key = store.entries.keySet().iterator().next();
    assertFalse(key.contains("anna"));
    assertTrue(key.startsWith("astax-email-code:"));
  }
}
