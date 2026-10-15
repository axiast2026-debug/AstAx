import { z } from "zod";

const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const hexKey = z.string().regex(/^[0-9a-f]{64}$/i, "must be 32 bytes in hex");

const configSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DEV_TOOLS: flag,
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    FIELD_ENCRYPTION_KEY: hexKey,
    BLIND_INDEX_KEY: hexKey,
    KEYCLOAK_URL: z.url(),
    KEYCLOAK_REALM: z.string().min(1).default("astax"),
    KEYCLOAK_API_ADMIN_SECRET: z.string().min(16),
    /** Public address of apps/web, used in links sent by email. */
    WEB_URL: z.url().default("http://localhost:3000"),
    /** Development email delivery (Mailpit); production uses a real provider (phase 8). */
    MAILPIT_URL: z.url().default("http://127.0.0.1:8025"),
    EMAIL_FROM: z.email().default("noreply@astax.test"),
    /** 0 switches the outbox dispatcher off (tests run it by hand). */
    OUTBOX_DISPATCH_INTERVAL_MS: z.coerce.number().int().min(0).default(5000),
  })
  // Development tools never run in production (CLAUDE.md rule 13).
  .refine((c) => !(c.NODE_ENV === "production" && c.DEV_TOOLS), {
    message: "DEV_TOOLS must be false in production",
    path: ["DEV_TOOLS"],
  });

export type ApiConfig = z.infer<typeof configSchema>;

export class InvalidConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid API configuration: ${problems.join("; ")}`);
    this.name = "InvalidConfigError";
  }
}

/**
 * Reads and validates the environment once, at start-up. Error messages name
 * the variables, never their values (they are secrets).
 */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): ApiConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new InvalidConfigError(
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  return parsed.data;
}
