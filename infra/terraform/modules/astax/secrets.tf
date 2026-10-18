# Secrets Manager (SIC-07): the secrets exist here, their values are put in by
# hand (console or CLI) and never pass through the repository or the chat.
# Exceptions: REDIS_URL, written by Terraform from the generated password.
locals {
  secret_names = toset([
    "FIELD_ENCRYPTION_KEY", "BLIND_INDEX_KEY",
    "DATABASE_URL_APP", "DATABASE_URL_OWNER", "KEYCLOAK_DB_PASSWORD",
    "KEYCLOAK_ADMIN_PASSWORD", "KEYCLOAK_API_ADMIN_SECRET",
    "REDIS_URL",
    "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY",
    "OPENAPI_AUTOMOTIVE_TOKEN", "OPENAPI_SDI_TOKEN", "OPENAPI_SDI_WEBHOOK_SECRET",
    "TEMPORAL_API_KEY", "SENTRY_DSN", "OTEL_EXPORTER_OTLP_HEADERS",
  ])
}

resource "aws_secretsmanager_secret" "app" {
  for_each   = local.secret_names
  name       = "astax/${var.environment}/${each.key}"
  kms_key_id = aws_kms_key.data.arn
  tags       = local.tags
}
