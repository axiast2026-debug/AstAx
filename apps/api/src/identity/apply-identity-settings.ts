import {
  EMAIL_CODE_CONFIG,
  emailCodeConfig,
  keycloakSessionSettings,
} from "@astax/adapters/identity";
import type { SettingKey } from "@astax/shared/settings";
import type { IdentityAdmin } from "./identity-admin.js";

/** Parameters that live in Keycloak too: changing one re-applies them (fase 1, passo 6). */
export const IDENTITY_SETTING_KEYS = [
  "session.privateDays",
  "session.professionalIdleHours",
  "session.staffIdleHours",
  "otp.validityMinutes",
  "otp.maxAttempts",
] as const satisfies readonly SettingKey[];

export function isIdentitySetting(key: string): boolean {
  return (IDENTITY_SETTING_KEYS as readonly string[]).includes(key);
}

export interface IdentitySettingValues {
  "session.privateDays": number;
  "session.professionalIdleHours": number;
  "session.staffIdleHours": number;
  "otp.validityMinutes": number;
  "otp.maxAttempts": number;
}

/** Pushes the session durations and the email-code limits to Keycloak. */
export async function applyIdentitySettings(
  admin: Pick<
    IdentityAdmin,
    "updateRealm" | "updateClientAttributes" | "updateAuthenticatorConfig"
  >,
  values: IdentitySettingValues,
): Promise<void> {
  const sessions = keycloakSessionSettings({
    privateDays: values["session.privateDays"],
    professionalIdleHours: values["session.professionalIdleHours"],
    staffIdleHours: values["session.staffIdleHours"],
  });
  await admin.updateRealm(sessions.realm);
  for (const [clientId, attributes] of Object.entries(sessions.clients)) {
    await admin.updateClientAttributes(clientId, attributes);
  }
  await admin.updateAuthenticatorConfig(
    EMAIL_CODE_CONFIG.id,
    EMAIL_CODE_CONFIG.alias,
    emailCodeConfig({
      validityMinutes: values["otp.validityMinutes"],
      maxAttempts: values["otp.maxAttempts"],
    }),
  );
}
