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
    /** 127.0.0.1 on a developer's machine; 0.0.0.0 in a container (phase 8). */
    API_HOST: z.string().min(1).default("127.0.0.1"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    FIELD_ENCRYPTION_KEY: hexKey,
    BLIND_INDEX_KEY: hexKey,
    /**
     * Master key of the fake KMS for the agencies' own copies (BC-04, ADR 0005).
     * The API never reads SEALED_BIDS_MASTER_KEY: only the worker opens bids.
     */
    OFFER_OWNER_MASTER_KEY: hexKey.optional(),
    KEYCLOAK_URL: z.url(),
    KEYCLOAK_REALM: z.string().min(1).default("astax"),
    /**
     * Phase 8: where the API reaches Keycloak's administration. In AWS the private
     * address (keycloak.astax.internal): the public one does not serve /admin.
     */
    KEYCLOAK_ADMIN_URL: z.url().optional(),
    KEYCLOAK_API_ADMIN_SECRET: z.string().min(16),
    /** Public address of apps/web, used in links sent by email. */
    WEB_URL: z.url().default("http://localhost:3000"),
    /** Public address of apps/admin, allowed to open the realtime connection. */
    ADMIN_URL: z.url().default("http://localhost:3001"),
    /** Development email delivery (Mailpit); production uses a real provider (phase 8). */
    MAILPIT_URL: z.url().default("http://127.0.0.1:8025"),
    /**
     * Phase 8, docs/adattatori.md: each provider is chosen here, the fake (rule 9)
     * or the real one. The release gate refuses a fake in production.
     */
    AWS_REGION: z.string().min(1).default("eu-south-1"),
    EMAIL_PROVIDER: z.enum(["fake", "ses"]).default("fake"),
    /** "aws": the documents' bucket with the task's role; "fake": SeaweedFS or memory. */
    STORAGE_PROVIDER: z.enum(["fake", "aws"]).default("fake"),
    /** Namirial and Fabrick arrive in part B of phase 8: until then only the fakes. */
    SIGNATURE_PROVIDER: z.enum(["fake"]).default("fake"),
    PAYMENTS_PROVIDER: z.enum(["fake"]).default("fake"),
    SES_CONFIGURATION_SET: z.string().min(1).optional(),
    SMS_PROVIDER: z.enum(["fake", "aws"]).default("fake"),
    SMS_ORIGINATOR: z.string().min(1).default("AstAx"),
    SMS_CONFIGURATION_SET: z.string().min(1).optional(),
    KMS_PROVIDER: z.enum(["fake", "aws"]).default("fake"),
    /** AWS KMS key (ARN or alias) of the agencies' own copies; never the sealed bids' key. */
    KMS_OFFER_OWNER_KEY_ID: z.string().min(1).optional(),
    AI_PROVIDER: z.enum(["fake", "bedrock"]).default("fake"),
    PLATE_PROVIDER: z.enum(["fake", "openapi"]).default("fake"),
    OPENAPI_AUTOMOTIVE_URL: z.url().default("https://test.automotive.openapi.com"),
    OPENAPI_AUTOMOTIVE_TOKEN: z.string().min(1).optional(),
    SDI_PROVIDER: z.enum(["fake", "openapi"]).default("fake"),
    OPENAPI_SDI_URL: z.url().default("https://test.sdi.openapi.it"),
    OPENAPI_SDI_TOKEN: z.string().min(1).optional(),
    /** The header value Openapi sends with its callbacks (set in its /api_configurations). */
    OPENAPI_SDI_WEBHOOK_SECRET: z.string().min(16).optional(),
    /** EU cross-region inference profile of Claude on Bedrock. */
    BEDROCK_MODEL_ID: z.string().min(1).optional(),
    /** Phase 8: "vapid" sends real Web Push; "fake" delivers them to Mailpit (rule 9). */
    PUSH_PROVIDER: z.enum(["fake", "vapid"]).default("fake"),
    VAPID_PUBLIC_KEY: z.string().min(40).optional(),
    VAPID_PRIVATE_KEY: z.string().min(40).optional(),
    VAPID_SUBJECT: z
      .string()
      .regex(/^(mailto:|https:)/)
      .default("mailto:sicurezza@astax.it"),
    EMAIL_FROM: z.email().default("noreply@astax.test"),
    /** Writes session and OTP parameters to Keycloak at start-up (false in tests). */
    IDENTITY_SYNC_ON_START: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    /** Temporal, for the signals to the requests' workflows (ADR 0008). */
    TEMPORAL_ADDRESS: z.string().min(1).optional(),
    TEMPORAL_PORT: z.coerce.number().int().min(1).max(65535).default(7233),
    TEMPORAL_NAMESPACE: z.string().min(1).default("astax"),
    /** Phase 8, ADR 0012: the API key of Temporal Cloud; with it the connection uses TLS. */
    TEMPORAL_API_KEY: z.string().min(1).optional(),
    /**
     * Who may write X-Forwarded-For (Express "trust proxy"): the web apps on the same
     * machine in development; in the cloud the private network of the services (phase 8).
     */
    API_TRUST_PROXY: z.string().min(1).default("loopback"),
    /** Phase 8: how often the invoices still to deliver go to SDI (0: never, as in the tests). */
    INVOICE_DELIVERY_INTERVAL_MS: z.coerce.number().int().min(0).default(300_000),
    /** ADR 0014: the round of the broker's lots (reminders, scheduled submissions); 0 = off. */
    BATCH_SCHEDULE_INTERVAL_MS: z.coerce.number().int().min(0).default(300_000),
    /** Redis, for the realtime events published by the worker (ADR 0008). */
    REDIS_URL: z.string().min(1).optional(),
    REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6380),
    /** Document storage: SeaweedFS in development (ADR 0003), S3 in the cloud (phase 8). */
    S3_ENDPOINT: z.url().optional(),
    S3_PORT: z.coerce.number().int().min(1).max(65535).default(8333),
    S3_REGION: z.string().min(1).default("eu-south-1"),
    S3_BUCKET: z.string().min(3).default("astax-documents"),
    S3_ACCESS_KEY: z.string().min(1).optional(),
    S3_SECRET_KEY: z.string().min(1).optional(),
  })
  // Development tools never run in production (CLAUDE.md rule 13).
  .refine(
    (c) => (c.KMS_PROVIDER === "aws" ? !!c.KMS_OFFER_OWNER_KEY_ID : !!c.OFFER_OWNER_MASTER_KEY),
    {
      message:
        "KMS_PROVIDER=aws needs KMS_OFFER_OWNER_KEY_ID; the fake KMS needs OFFER_OWNER_MASTER_KEY",
      path: ["KMS_PROVIDER"],
    },
  )
  .refine((c) => c.PLATE_PROVIDER !== "openapi" || !!c.OPENAPI_AUTOMOTIVE_TOKEN, {
    message: "PLATE_PROVIDER=openapi needs OPENAPI_AUTOMOTIVE_TOKEN",
    path: ["PLATE_PROVIDER"],
  })
  .refine(
    (c) =>
      c.SDI_PROVIDER !== "openapi" || (!!c.OPENAPI_SDI_TOKEN && !!c.OPENAPI_SDI_WEBHOOK_SECRET),
    {
      message: "SDI_PROVIDER=openapi needs OPENAPI_SDI_TOKEN and OPENAPI_SDI_WEBHOOK_SECRET",
      path: ["SDI_PROVIDER"],
    },
  )
  .refine((c) => c.AI_PROVIDER !== "bedrock" || !!c.BEDROCK_MODEL_ID, {
    message: "AI_PROVIDER=bedrock needs BEDROCK_MODEL_ID",
    path: ["AI_PROVIDER"],
  })
  .refine((c) => c.PUSH_PROVIDER !== "vapid" || (c.VAPID_PUBLIC_KEY && c.VAPID_PRIVATE_KEY), {
    message: "PUSH_PROVIDER=vapid needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY",
    path: ["PUSH_PROVIDER"],
  })
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
