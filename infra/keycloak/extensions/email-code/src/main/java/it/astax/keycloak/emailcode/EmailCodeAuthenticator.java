package it.astax.keycloak.emailcode;

import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.regex.Pattern;
import org.jboss.logging.Logger;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.Authenticator;
import org.keycloak.common.util.Time;
import org.keycloak.email.EmailException;
import org.keycloak.email.EmailTemplateProvider;
import org.keycloak.models.AuthenticatorConfigModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.RoleModel;
import org.keycloak.models.UserModel;
import org.keycloak.sessions.AuthenticationSessionModel;

/**
 * Passwordless login for private customers: the user types an email address,
 * receives a one-time code and types it back. Only accounts with the realm role
 * astax-private may log in this way: professional and staff accounts must use
 * password and TOTP (SIC-05). A private account is created on its first login.
 */
public class EmailCodeAuthenticator implements Authenticator {

  private static final Logger LOG = Logger.getLogger(EmailCodeAuthenticator.class);
  static final String PRIVATE_ROLE = "astax-private";

  private static final String NOTE_USER = "astax.emailCode.userId";
  private static final String NOTE_HASH = "astax.emailCode.hash";
  private static final String NOTE_EXPIRES = "astax.emailCode.expiresAt";
  private static final String NOTE_ATTEMPTS = "astax.emailCode.attempts";

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
      authenticate(context);
    } else if (form.containsKey("code")) {
      verifyCode(context, form.getFirst("code"));
    } else {
      sendCode(context, form.getFirst("email"));
    }
  }

  private void sendCode(AuthenticationFlowContext context, String rawEmail) {
    String email = rawEmail == null ? "" : rawEmail.trim().toLowerCase();
    if (!EMAIL.matcher(email).matches() || email.length() > 254) {
      emailError(context, "astaxEmailCodeInvalidEmail");
      return;
    }
    KeycloakSession session = context.getSession();
    RealmModel realm = context.getRealm();
    UserModel user = session.users().getUserByEmail(realm, email);
    if (user == null) {
      user = session.users().addUser(realm, email);
      user.setEnabled(true);
      user.setEmail(email);
      user.setEmailVerified(false);
      RoleModel role = realm.getRole(PRIVATE_ROLE);
      if (role != null) user.grantRole(role);
    }
    if (!isPrivate(realm, user)) {
      // Same message for disabled and professional accounts: nothing is revealed.
      emailError(context, "astaxEmailCodeNotAllowed");
      return;
    }

    Settings settings = Settings.of(context.getAuthenticatorConfig());
    String code = newCode(settings.codeLength());
    AuthenticationSessionModel auth = context.getAuthenticationSession();
    auth.setAuthNote(NOTE_USER, user.getId());
    auth.setAuthNote(NOTE_HASH, sha256(code));
    auth.setAuthNote(NOTE_EXPIRES, Long.toString(Time.currentTimeMillis() + settings.ttlMinutes() * 60_000L));
    auth.setAuthNote(NOTE_ATTEMPTS, "0");

    try {
      session.getProvider(EmailTemplateProvider.class)
          .setRealm(realm)
          .setUser(user)
          .send(
              "astaxEmailCodeSubject",
              new ArrayList<>(),
              "astax-email-code.ftl",
              // Mutable: Keycloak adds its own attributes (user, realm) to these collections.
              new HashMap<>(Map.of("code", code, "ttlMinutes", settings.ttlMinutes())));
    } catch (EmailException e) {
      // Exception types only: messages may contain the address (SIC-06).
      Throwable cause = e.getCause();
      LOG.warnf("Email code not sent: %s caused by %s", e.getClass().getSimpleName(),
          cause == null ? "-" : cause.getClass().getName());
      clearNotes(auth);
      emailError(context, "astaxEmailCodeSendFailed");
      return;
    }
    context.challenge(context.form().setAttribute("email", email).createForm(CODE_FORM));
  }

  private void verifyCode(AuthenticationFlowContext context, String rawCode) {
    AuthenticationSessionModel auth = context.getAuthenticationSession();
    String userId = auth.getAuthNote(NOTE_USER);
    String hash = auth.getAuthNote(NOTE_HASH);
    String expires = auth.getAuthNote(NOTE_EXPIRES);
    if (userId == null || hash == null || expires == null) {
      authenticate(context);
      return;
    }
    if (Time.currentTimeMillis() > Long.parseLong(expires)) {
      clearNotes(auth);
      emailError(context, "astaxEmailCodeExpired");
      return;
    }
    Settings settings = Settings.of(context.getAuthenticatorConfig());
    int attempts = Integer.parseInt(auth.getAuthNote(NOTE_ATTEMPTS)) + 1;
    auth.setAuthNote(NOTE_ATTEMPTS, Integer.toString(attempts));

    String code = rawCode == null ? "" : rawCode.replaceAll("\\s", "");
    boolean matches =
        MessageDigest.isEqual(
            sha256(code).getBytes(StandardCharsets.US_ASCII), hash.getBytes(StandardCharsets.US_ASCII));
    if (!matches) {
      if (attempts >= settings.maxAttempts()) {
        clearNotes(auth);
        emailError(context, "astaxEmailCodeTooManyAttempts");
      } else {
        Response challenge =
            context.form().setError("astaxEmailCodeWrong").createForm(CODE_FORM);
        context.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS, challenge);
      }
      return;
    }

    UserModel user = context.getSession().users().getUserById(context.getRealm(), userId);
    clearNotes(auth);
    if (user == null || !isPrivate(context.getRealm(), user)) {
      emailError(context, "astaxEmailCodeNotAllowed");
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

  private static void clearNotes(AuthenticationSessionModel auth) {
    auth.removeAuthNote(NOTE_USER);
    auth.removeAuthNote(NOTE_HASH);
    auth.removeAuthNote(NOTE_EXPIRES);
    auth.removeAuthNote(NOTE_ATTEMPTS);
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

  /** Values set by the API from the AstAx parameters otp.validityMinutes and otp.maxAttempts. */
  record Settings(int ttlMinutes, int maxAttempts, int codeLength) {
    static Settings of(AuthenticatorConfigModel config) {
      Map<String, String> values = config == null ? Map.of() : config.getConfig();
      return new Settings(
          intOr(values, EmailCodeAuthenticatorFactory.TTL_MINUTES, 10),
          intOr(values, EmailCodeAuthenticatorFactory.MAX_ATTEMPTS, 5),
          intOr(values, EmailCodeAuthenticatorFactory.CODE_LENGTH, 6));
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
