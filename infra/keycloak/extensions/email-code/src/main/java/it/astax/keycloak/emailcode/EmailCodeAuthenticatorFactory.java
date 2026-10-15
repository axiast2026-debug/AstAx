package it.astax.keycloak.emailcode;

import java.util.List;
import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

public class EmailCodeAuthenticatorFactory implements AuthenticatorFactory {

  public static final String ID = "astax-email-code";
  static final String TTL_MINUTES = "codeTtlMinutes";
  static final String MAX_ATTEMPTS = "maxAttempts";
  static final String CODE_LENGTH = "codeLength";

  private static final EmailCodeAuthenticator SINGLETON = new EmailCodeAuthenticator();

  @Override
  public String getId() {
    return ID;
  }

  @Override
  public String getDisplayType() {
    return "AstAx email code (private customers)";
  }

  @Override
  public String getReferenceCategory() {
    return "otp";
  }

  @Override
  public boolean isConfigurable() {
    return true;
  }

  @Override
  public AuthenticationExecutionModel.Requirement[] getRequirementChoices() {
    return new AuthenticationExecutionModel.Requirement[] {
      AuthenticationExecutionModel.Requirement.REQUIRED,
      AuthenticationExecutionModel.Requirement.ALTERNATIVE,
      AuthenticationExecutionModel.Requirement.DISABLED
    };
  }

  @Override
  public boolean isUserSetupAllowed() {
    return false;
  }

  @Override
  public String getHelpText() {
    return "Passwordless login with a one-time code sent by email; refuses non-private accounts.";
  }

  @Override
  public List<ProviderConfigProperty> getConfigProperties() {
    return List.of(
        property(TTL_MINUTES, "Code validity (minutes)", "10"),
        property(MAX_ATTEMPTS, "Maximum attempts per code", "5"),
        property(CODE_LENGTH, "Code length (digits)", "6"));
  }

  private static ProviderConfigProperty property(String name, String label, String defaultValue) {
    ProviderConfigProperty property = new ProviderConfigProperty();
    property.setName(name);
    property.setLabel(label);
    property.setType(ProviderConfigProperty.STRING_TYPE);
    property.setDefaultValue(defaultValue);
    return property;
  }

  @Override
  public Authenticator create(KeycloakSession session) {
    return SINGLETON;
  }

  @Override
  public void init(Config.Scope config) {}

  @Override
  public void postInit(KeycloakSessionFactory factory) {}

  @Override
  public void close() {}
}
