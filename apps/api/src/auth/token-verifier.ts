import type { Clock } from "@astax/adapters/clock";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

/** What the API keeps from a verified Keycloak access token. */
export interface VerifiedToken {
  sub: string;
  /** Client the token was issued to. */
  azp: string;
  roles: string[];
  email: string | null;
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

export class InvalidTokenError extends Error {
  constructor() {
    super("Invalid access token");
    this.name = "InvalidTokenError";
  }
}

export const API_AUDIENCE = "astax-api";

function readClaims(payload: JWTPayload): VerifiedToken {
  const realmAccess = payload.realm_access as { roles?: unknown } | undefined;
  const roles = Array.isArray(realmAccess?.roles)
    ? realmAccess.roles.filter((r): r is string => typeof r === "string")
    : [];
  const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
  if (!payload.sub || typeof payload.azp !== "string") throw new InvalidTokenError();
  return {
    sub: payload.sub,
    azp: payload.azp,
    roles,
    email: text(payload.email),
    emailVerified: payload.email_verified === true,
    givenName: text(payload.given_name),
    familyName: text(payload.family_name),
  };
}

/**
 * Verifies signature (keys published by Keycloak), issuer, audience and expiry,
 * with the time of the Clock (rule 6).
 */
export class JwtTokenVerifier implements TokenVerifier {
  constructor(
    private readonly keys: JWTVerifyGetKey,
    private readonly issuer: string,
    private readonly clock: Clock,
  ) {}

  static forKeycloak(baseUrl: string, realm: string, clock: Clock): JwtTokenVerifier {
    const issuer = `${baseUrl}/realms/${realm}`;
    const jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
    return new JwtTokenVerifier(jwks, issuer, clock);
  }

  async verify(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.issuer,
        audience: API_AUDIENCE,
        algorithms: ["RS256"],
        currentDate: this.clock.now(),
      });
      return readClaims(payload);
    } catch {
      throw new InvalidTokenError();
    }
  }
}
