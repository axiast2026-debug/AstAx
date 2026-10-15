/** Keycloak clients of AstAx (infra/keycloak/import/realm-astax.json). */
export const KEYCLOAK_CLIENTS = {
  private: "astax-web-private",
  professional: "astax-web-pro",
  staff: "astax-admin",
} as const;

/** Fixed id of the email-code authenticator configuration in the realm file. */
export const EMAIL_CODE_CONFIG = {
  id: "0199e5c0-0000-7000-8000-00000000c0de",
  alias: "astax-email-code-config",
};

export interface SessionParameters {
  privateDays: number;
  professionalIdleHours: number;
  staffIdleHours: number;
}

export interface KeycloakSessionSettings {
  realm: { ssoSessionIdleTimeout: number; ssoSessionMaxLifespan: number };
  clients: Record<string, Record<string, string>>;
}

const DAY = 86_400;
const HOUR = 3_600;

/**
 * Translates the AstAx parameters session.* into Keycloak settings (SIC-05).
 * Client values can only shorten the realm ones, so the realm takes the longest.
 * Private customers: the session lasts N days from login (domanda aperta 2).
 */
export function keycloakSessionSettings(p: SessionParameters): KeycloakSessionSettings {
  const privateSeconds = p.privateDays * DAY;
  const longest = Math.max(privateSeconds, p.professionalIdleHours * HOUR, p.staffIdleHours * HOUR);
  return {
    realm: { ssoSessionIdleTimeout: longest, ssoSessionMaxLifespan: longest },
    clients: {
      [KEYCLOAK_CLIENTS.private]: {
        "client.session.idle.timeout": String(privateSeconds),
        "client.session.max.lifespan": String(privateSeconds),
      },
      [KEYCLOAK_CLIENTS.professional]: {
        "client.session.idle.timeout": String(p.professionalIdleHours * HOUR),
      },
      [KEYCLOAK_CLIENTS.staff]: { "client.session.idle.timeout": String(p.staffIdleHours * HOUR) },
    },
  };
}

/** Translates otp.validityMinutes and otp.maxAttempts into the email-code authenticator config. */
export function emailCodeConfig(p: {
  validityMinutes: number;
  maxAttempts: number;
}): Record<string, string> {
  return {
    codeTtlMinutes: String(p.validityMinutes),
    maxAttempts: String(p.maxAttempts),
    codeLength: "6",
  };
}
