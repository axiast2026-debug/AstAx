package it.astax.keycloak.emailcode;

import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.text.MessageFormat;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.regex.Pattern;
import org.jboss.logging.Logger;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.Authenticator;
import org.keycloak.common.util.Time;
import org.keycloak.email.EmailException;
import org.keycloak.email.EmailSenderProvider;
import org.keycloak.models.AuthenticatorConfigModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.RoleModel;
import org.keycloak.models.SingleUseObjectProvider;
import org.keycloak.models.UserModel;
import org.keycloak.sessions.AuthenticationSessionModel;
import org.keycloak.theme.Theme;

/**
 * Passwordless login for private customers: the user types an email address,
 * receives a one-time code and types it back. Only accounts with the realm role
 * astax-private may log in this way: professional and staff accounts must use
 * password and TOTP (SIC-05). A private account is created on its first verified
 * login, never before.
 */
public class EmailCodeAuthenticator implements Authenticator {

  private static final Logger LOG = Logger.getLogger(EmailCodeAuthenticator.class);
  static final String PRIVATE_ROLE = "astax-private";

  private static final String NOTE_EMAIL = "astax.emailCode.email";
  private static final String NOTE_BLOCKED = "astax.emailCode.blocked";
  private static final String NOTE_HASH = "astax.emailCode.hash";
  private static final String NOTE_EXPIRES = "astax.emailCode.expiresAt";
  private static final String NOTE_ATTEMPTS = "astax.emailCode.attempts";
  private static final String NOTE_SENDS = "astax.emailCode.sends";
  /** Codes one login attempt may request: stops the form being used to flood a mailbox. */
  private static final int MAX_SENDS_PER_LOGIN = 3;

  private static final String EMAIL_FORM = "astax-email-code-email.ftl";
  private static final String CODE_FORM = "astax-email-code-code.ftl";
  private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
  private static final SecureRandom RANDOM = new SecureRandom();

  @Override
  public void authenticate(AuthenticationFlowContext context) {
    clearNotes(context.getAuthenticationSession());
    context.challenge(context.form().createForm(EMAIL_FORM));
  }

  @Override
  public void action(AuthenticationFlowContext context) {
    MultivaluedMap<String, String> form = context.getHttpRequest().getDecodedFormParameters();
    if (form.containsKey("restart")) {
      // Keeps the count of codes already sent in this login attempt.
      clearCode(context.getAuthenticationSession());
      context.challenge(context.form().createForm(EMAIL_FORM));
    } else if (form.containsKey("code")) {
      verifyCode(context, form.getFirst("code"));
    } else {
      sendCode(context, form.getFirst("email"));
    }
  }

  /**
   * No account is created here: only a verified code creates one. Otherwise anyone
   * could reserve someone else's address as private and block a team invitation.
   * Addresses that may not log in this way get the same page and no code, so the
   * form does not reveal which addresses belong to professionals.
   */
  private void sendCode(AuthenticationFlowContext context, String rawEmail) {
    String email = rawEmail == null ? "" : rawEmail.trim().toLowerCase(Locale.ROOT);
    if (!EMAIL.matcher(email).matches() || email.length() > 254) {
      emailError(context, "astaxEmailCodeInvalidEmail");
      return;
    }
    AuthenticationSessionModel auth = context.getAuthenticationSession();
    int sends = parseOr(auth.getAuthNote(NOTE_SENDS), 0) + 1;
    if (sends > MAX_SENDS_PER_LOGIN) {
      emailError(context, "astaxEmailCodeTooManySends");
      return;
    }
    auth.setAuthNote(NOTE_SENDS, Integer.toString(sends));

    KeycloakSession session = context.getSession();
    RealmModel realm = context.getRealm();
    Settings settings = Settings.of(context.getAuthenticatorConfig());
    // Phase 8: a limit per address across login attempts (security.emailCodesPerAddressPerHour).
    // Counted for every address, so the answer says nothing about who has an account.
    if (!withinHourlyLimit(session, email, settings.maxCodesPerHour())) {
      emailError(context, "astaxEmailCodeTooManySends");
      return;
    }
    UserModel existing = session.users().getUserByEmail(realm, email);
    boolean allowed = existing == null || isPrivate(realm, existing);

    String code = newCode(settings.codeLength());
    auth.setAuthNote(NOTE_EMAIL, email);
    auth.setAuthNote(NOTE_BLOCKED, Boolean.toString(!allowed));
    auth.setAuthNote(NOTE_HASH, sha256(code));
    auth.setAuthNote(NOTE_EXPIRES, Long.toString(Time.currentTimeMillis() + settings.ttlMinutes() * 60_000L));
    auth.setAuthNote(NOTE_ATTEMPTS, "0");

    if (allowed) {
      try {
        sendCodeEmail(session, realm, email, code, settings.ttlMinutes());
      } catch (EmailException | IOException e) {
        // Exception types only: messages may contain the address (SIC-06).
        Throwable cause = e.getCause();
        LOG.warnf("Email code not sent: %s caused by %s", e.getClass().getSimpleName(),
            cause == null ? "-" : cause.getClass().getName());
        clearCode(auth);
        emailError(context, "astaxEmailCodeSendFailed");
        return;
      }
    }
    context.challenge(context.form().setAttribute("email", email).createForm(CODE_FORM));
  }

  /**
   * Codes sent to one address in the current hour, kept in Keycloak's cluster-wide
   * store under a hash of the address (no address in the key, SIC-06).
   */
  private static boolean withinHourlyLimit(KeycloakSession session, String email, int maxPerHour) {
    SingleUseObjectProvider store = session.singleUseObjects();
    long hour = Time.currentTimeMillis() / 3_600_000L;
    String key = "astax-email-code:" + sha256(email) + ":" + hour;
    Map<String, String> current = store.get(key);
    int count = current == null ? 0 : parseOr(current.get("count"), 0);
    if (count >= maxPerHour) return false;
    Map<String, String> next = Map.of("count", Integer.toString(count + 1));
    if (current == null) store.put(key, 3_600L, next);
    else store.replace(key, next);
    return true;
  }

  /** Texts come from the email theme (messages_it.properties), never from the code. */
  private static void sendCodeEmail(
      KeycloakSession session, RealmModel realm, String email, String code, int ttlMinutes)
      throws EmailException, IOException {
    Locale locale = session.getContext().resolveLocale(null);
    Properties messages = session.theme().getTheme(Theme.Type.EMAIL).getEnhancedMessages(realm, locale);
    Object[] args = {code, Integer.toString(ttlMinutes)};
    String subject = new MessageFormat(messages.getProperty("astaxEmailCodeSubject"), locale).format(args);
    String text = new MessageFormat(messages.getProperty("astaxEmailCodeBody"), locale).format(args);
    String html = new MessageFormat(messages.getProperty("astaxEmailCodeBodyHtml"), locale).format(args);
    session.getProvider(EmailSenderProvider.class).send(realm.getSmtpConfig(), email, subject, text, html);
  }

  private void verifyCode(AuthenticationFlowContext context, String rawCode) {
    AuthenticationSessionModel auth = context.getAuthenticationSession();
    String email = auth.getAuthNote(NOTE_EMAIL);
    String hash = auth.getAuthNote(NOTE_HASH);
    String expires = auth.getAuthNote(NOTE_EXPIRES);
    if (email == null || hash == null || expires == null) {
      authenticate(context);
      return;
    }
    if (Time.currentTimeMillis() > Long.parseLong(expires)) {
      clearCode(auth);
      emailError(context, "astaxEmailCodeExpired");
      return;
    }
    Settings settings = Settings.of(context.getAuthenticatorConfig());
    int attempts = parseOr(auth.getAuthNote(NOTE_ATTEMPTS), 0) + 1;
    auth.setAuthNote(NOTE_ATTEMPTS, Integer.toString(attempts));

    String code = rawCode == null ? "" : rawCode.replaceAll("\\s", "");
    boolean matches =
        !Boolean.parseBoolean(auth.getAuthNote(NOTE_BLOCKED))
            && MessageDigest.isEqual(
                sha256(code).getBytes(StandardCharsets.US_ASCII), hash.getBytes(StandardCharsets.US_ASCII));
    if (!matches) {
      if (attempts >= settings.maxAttempts()) {
        clearCode(auth);
        emailError(context, "astaxEmailCodeTooManyAttempts");
      } else {
        Response challenge =
            context.form().setAttribute("email", email).setError("astaxEmailCodeWrong").createForm(CODE_FORM);
        context.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS, challenge);
      }
      return;
    }

    RealmModel realm = context.getRealm();
    UserModel user = context.getSession().users().getUserByEmail(realm, email);
    if (user == null) {
      // First access of a private customer: the account exists only from a verified code.
      user = context.getSession().users().addUser(realm, email);
      user.setEnabled(true);
      user.setEmail(email);
      RoleModel role = realm.getRole(PRIVATE_ROLE);
      if (role != null) user.grantRole(role);
    }
    clearNotes(auth);
    if (!isPrivate(realm, user)) {
      emailError(context, "astaxEmailCodeWrong");
      return;
    }
    if (!user.isEmailVerified()) user.setEmailVerified(true);
    context.setUser(user);
    context.success();
  }

  private static boolean isPrivate(RealmModel realm, UserModel user) {
    RoleModel role = realm.getRole(PRIVATE_ROLE);
    return user.isEnabled() && role != null && user.hasRole(role);
  }

  private static void emailError(AuthenticationFlowContext context, String message) {
    Response challenge = context.form().setError(message).createForm(EMAIL_FORM);
    context.failureChallenge(AuthenticationFlowError.INVALID_USER, challenge);
  }

  /** Forgets the current code; the count of codes sent in this login attempt stays. */
  private static void clearCode(AuthenticationSessionModel auth) {
    auth.removeAuthNote(NOTE_EMAIL);
    auth.removeAuthNote(NOTE_BLOCKED);
    auth.removeAuthNote(NOTE_HASH);
    auth.removeAuthNote(NOTE_EXPIRES);
    auth.removeAuthNote(NOTE_ATTEMPTS);
  }

  private static void clearNotes(AuthenticationSessionModel auth) {
    clearCode(auth);
    auth.removeAuthNote(NOTE_SENDS);
  }

  private static int parseOr(String value, int fallback) {
    try {
      return value == null ? fallback : Integer.parseInt(value);
    } catch (NumberFormatException e) {
      return fallback;
    }
  }

  private static String newCode(int length) {
    StringBuilder code = new StringBuilder(length);
    for (int i = 0; i < length; i++) code.append(RANDOM.nextInt(10));
    return code.toString();
  }

  private static String sha256(String value) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  @Override
  public boolean requiresUser() {
    return false;
  }

  @Override
  public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
    return true;
  }

  @Override
  public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {}

  @Override
  public void close() {}

  /**
   * Values written by the API from the AstAx parameters otp.validityMinutes and
   * otp.maxAttempts and security.emailCodesPerAddressPerHour (keycloak:sync and every parameter change). The fallbacks are
   * the seed values, used only if the configuration were missing.
   */
  record Settings(int ttlMinutes, int maxAttempts, int codeLength, int maxCodesPerHour) {
    static Settings of(AuthenticatorConfigModel config) {
      Map<String, String> values = config == null ? Map.of() : config.getConfig();
      return new Settings(
          intOr(values, EmailCodeAuthenticatorFactory.TTL_MINUTES, 10),
          intOr(values, EmailCodeAuthenticatorFactory.MAX_ATTEMPTS, 5),
          intOr(values, EmailCodeAuthenticatorFactory.CODE_LENGTH, 6),
          intOr(values, EmailCodeAuthenticatorFactory.MAX_CODES_PER_HOUR, 10));
    }

    private static int intOr(Map<String, String> values, String key, int fallback) {
      try {
        int parsed = Integer.parseInt(values.getOrDefault(key, ""));
        return parsed > 0 ? parsed : fallback;
      } catch (NumberFormatException e) {
        return fallback;
      }
    }
  }
}
