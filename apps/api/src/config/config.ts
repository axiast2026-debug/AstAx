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
    /**
     * Master key of the fake KMS for the agencies' own copies (BC-04, ADR 0005).
     * The API never reads SEALED_BIDS_MASTER_KEY: only the worker opens bids.
     */
    OFFER_OWNER_MASTER_KEY: hexKey,
    KEYCLOAK_URL: z.url(),
    KEYCLOAK_REALM: z.string().min(1).default("astax"),
    KEYCLOAK_API_ADMIN_SECRET: z.string().min(16),
    /** Public address of apps/web, used in links sent by email. */
    WEB_URL: z.url().default("http://localhost:3000"),
    /** Development email delivery (Mailpit); production uses a real provider (phase 8). */
    MAILPIT_URL: z.url().default("http://127.0.0.1:8025"),
    EMAIL_FROM: z.email().default("noreply@astax.test"),
    /** Writes session and OTP parameters to Keycloak at start-up (false in tests). */
    IDENTITY_SYNC_ON_START: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    /** Document storage: SeaweedFS in development (ADR 0003), S3 in the cloud (phase 8). */
    S3_ENDPOINT: z.url().optional(),
    S3_PORT: z.coerce.number().int().min(1).max(65535).default(8333),
    S3_REGION: z.string().min(1).default("eu-south-1"),
    S3_BUCKET: z.string().min(3).default("astax-documents"),
    S3_ACCESS_KEY: z.string().min(1).optional(),
    S3_SECRET_KEY: z.string().min(1).optional(),
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
