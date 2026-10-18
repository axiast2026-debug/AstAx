import { z } from "zod";

const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
const hexKey = z.string().regex(/^[0-9a-f]{64}$/i, "must be 32 bytes in hex");

/**
 * The worker's configuration (ADR 0008). It holds the master key of the
 * sealed bids (ADR 0005) and never the one of the agencies' copies.
 */
const configSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DEV_TOOLS: flag,
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    FIELD_ENCRYPTION_KEY: hexKey,
    BLIND_INDEX_KEY: hexKey,
    SEALED_BIDS_MASTER_KEY: hexKey.optional(),
    /** Phase 8 (docs/adattatori.md): the fake (rule 9) or the real provider of each port. */
    AWS_REGION: z.string().min(1).default("eu-south-1"),
    EMAIL_PROVIDER: z.enum(["fake", "ses"]).default("fake"),
    SES_CONFIGURATION_SET: z.string().min(1).optional(),
    SMS_PROVIDER: z.enum(["fake", "aws"]).default("fake"),
    SMS_ORIGINATOR: z.string().min(1).default("AstAx"),
    SMS_CONFIGURATION_SET: z.string().min(1).optional(),
    KMS_PROVIDER: z.enum(["fake", "aws"]).default("fake"),
    /** AWS KMS key (ARN or alias) of the sealed bids: only the worker's role may use it. */
    KMS_SEALED_BIDS_KEY_ID: z.string().min(1).optional(),
    AI_PROVIDER: z.enum(["fake", "bedrock"]).default("fake"),
    BEDROCK_MODEL_ID: z.string().min(1).optional(),
    TEMPORAL_ADDRESS: z.string().min(1).optional(),
    TEMPORAL_PORT: z.coerce.number().int().min(1).max(65535).default(7233),
    TEMPORAL_NAMESPACE: z.string().min(1).default("astax"),
    TEMPORAL_TASK_QUEUE: z.string().min(1).default("astax-requests"),
    WEB_URL: z.url().default("http://localhost:3000"),
    ADMIN_URL: z.url().default("http://localhost:3001"),
    /** Phase 8: "vapid" sends real Web Push; "fake" delivers them to Mailpit (rule 9). */
    PUSH_PROVIDER: z.enum(["fake", "vapid"]).default("fake"),
    VAPID_PUBLIC_KEY: z.string().min(40).optional(),
    VAPID_PRIVATE_KEY: z.string().min(40).optional(),
    VAPID_SUBJECT: z
      .string()
      .regex(/^(mailto:|https:)/)
      .default("mailto:sicurezza@astax.it"),
    /** Phase 8: read Keycloak's login events with the API's service account (optional). */
    KEYCLOAK_URL: z.url().optional(),
    KEYCLOAK_REALM: z.string().min(1).default("astax"),
    KEYCLOAK_API_ADMIN_SECRET: z.string().min(16).optional(),
    MAILPIT_URL: z.url().default("http://127.0.0.1:8025"),
    EMAIL_FROM: z.email().default("noreply@astax.test"),
    REDIS_URL: z.string().min(1).optional(),
    REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6380),
    /** Local health check (127.0.0.1 only): 200 while the worker runs. 0 switches it off. */
    WORKER_HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(4100),
    OUTBOX_DISPATCH_INTERVAL_MS: z.coerce.number().int().min(0).default(2000),
    /** How often the scheduled jobs (the Monday remittances) are checked. 0 switches them off. */
    SCHEDULES_INTERVAL_MS: z.coerce.number().int().min(0).default(300_000),
    S3_ENDPOINT: z.url().optional(),
    S3_PORT: z.coerce.number().int().min(1).max(65535).default(8333),
    S3_REGION: z.string().min(1).default("eu-south-1"),
    S3_BUCKET: z.string().min(3).default("astax-documents"),
    S3_ACCESS_KEY: z.string().min(1).optional(),
    S3_SECRET_KEY: z.string().min(1).optional(),
  })
  .refine(
    (c) => (c.KMS_PROVIDER === "aws" ? !!c.KMS_SEALED_BIDS_KEY_ID : !!c.SEALED_BIDS_MASTER_KEY),
    {
      message:
        "KMS_PROVIDER=aws needs KMS_SEALED_BIDS_KEY_ID; the fake KMS needs SEALED_BIDS_MASTER_KEY",
      path: ["KMS_PROVIDER"],
    },
  )
  .refine((c) => c.AI_PROVIDER !== "bedrock" || !!c.BEDROCK_MODEL_ID, {
    message: "AI_PROVIDER=bedrock needs BEDROCK_MODEL_ID",
    path: ["AI_PROVIDER"],
  })
  .refine((c) => !(c.NODE_ENV === "production" && c.DEV_TOOLS), {
    message: "DEV_TOOLS must be false in production",
    path: ["DEV_TOOLS"],
  })
  .refine((c) => c.NODE_ENV !== "production" || (c.S3_ACCESS_KEY && c.S3_SECRET_KEY), {
    message: "S3 credentials are required in production",
    path: ["S3_ACCESS_KEY"],
  });

export type WorkerConfig = z.infer<typeof configSchema>;

/** Validates the environment; messages name the variables, never their values. */
export function loadWorkerConfig(env: Readonly<Record<string, string | undefined>>): WorkerConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid worker configuration: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}
