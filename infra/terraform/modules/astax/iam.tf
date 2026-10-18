# One role per service: each can read only its own secrets and use only its
# own keys (BC-03: the API never the sealed bids; see kms.tf and the tests).
locals {
  services = toset(["web", "admin", "api", "worker", "keycloak", "tools"])
  service_secrets = {
    web      = ["REDIS_URL", "VAPID_PUBLIC_KEY"]
    admin    = ["REDIS_URL"]
    api      = ["DATABASE_URL_APP", "FIELD_ENCRYPTION_KEY", "BLIND_INDEX_KEY", "KEYCLOAK_API_ADMIN_SECRET", "REDIS_URL", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "OPENAPI_AUTOMOTIVE_TOKEN", "OPENAPI_SDI_TOKEN", "OPENAPI_SDI_WEBHOOK_SECRET", "TEMPORAL_API_KEY", "SENTRY_DSN", "OTEL_EXPORTER_OTLP_HEADERS"]
    worker   = ["DATABASE_URL_APP", "FIELD_ENCRYPTION_KEY", "BLIND_INDEX_KEY", "KEYCLOAK_API_ADMIN_SECRET", "REDIS_URL", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "TEMPORAL_API_KEY", "SENTRY_DSN", "OTEL_EXPORTER_OTLP_HEADERS"]
    keycloak = ["KEYCLOAK_DB_PASSWORD", "KEYCLOAK_ADMIN_PASSWORD"]
    tools    = ["DATABASE_URL_OWNER"]
  }
}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# What the task itself may do while running.
resource "aws_iam_role" "task" {
  for_each           = local.services
  name               = "${local.name}-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

# What ECS needs to start the task: pull the image, write logs, read its secrets.
resource "aws_iam_role" "execution" {
  for_each           = local.services
  name               = "${local.name}-${each.key}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "execution" {
  for_each = local.services
  role     = aws_iam_role.execution[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
        Resource = [for r in aws_ecr_repository.app : r.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.service[each.key].arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [for s in local.service_secrets[each.key] : aws_secretsmanager_secret.app[s].arn]
      },
      {
        Effect    = "Allow"
        Action    = ["kms:Decrypt"]
        Resource  = aws_kms_key.data.arn
        Condition = { StringEquals = { "kms:ViaService" = "secretsmanager.${local.region}.amazonaws.com" } }
      },
    ]
  })
}

# API: documents, its own KMS key, email, SMS, Bedrock.
resource "aws_iam_role_policy" "api" {
  role = aws_iam_role.task["api"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Documents"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.this["documents"].arn}/*"
      },
      {
        Sid      = "DocumentsKey"
        Effect   = "Allow"
        Action   = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource = aws_kms_key.data.arn
      },
      {
        Sid      = "OfferOwnerCopies"
        Effect   = "Allow"
        Action   = ["kms:Encrypt", "kms:Decrypt"]
        Resource = aws_kms_key.offer_owner.arn
      },
      {
        Sid      = "Email"
        Effect   = "Allow"
        Action   = ["ses:SendEmail"]
        Resource = "*"
      },
      {
        Sid      = "Sms"
        Effect   = "Allow"
        Action   = ["sms-voice:SendTextMessage"]
        Resource = "*"
      },
      {
        Sid      = "Claude"
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel", "bedrock:Converse"]
        Resource = "*"
      },
    ]
  })
}

# Worker: documents, the sealed bids' key (and nothing of the offer owner), email,
# SMS, Bedrock (quotes, OFF-09), CloudTrail for the nightly key check (BC-03).
resource "aws_iam_role_policy" "worker" {
  role = aws_iam_role.task["worker"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Documents"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.this["documents"].arn}/*"
      },
      {
        Sid      = "DocumentsKey"
        Effect   = "Allow"
        Action   = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource = aws_kms_key.data.arn
      },
      {
        Sid      = "SealedBids"
        Effect   = "Allow"
        Action   = ["kms:Encrypt", "kms:Decrypt"]
        Resource = aws_kms_key.sealed_bids.arn
      },
      {
        Sid      = "MessagesAndClaude"
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "sms-voice:SendTextMessage", "bedrock:InvokeModel", "bedrock:Converse"]
        Resource = "*"
      },
      {
        Sid      = "KeyCheck"
        Effect   = "Allow"
        Action   = ["cloudtrail:LookupEvents"]
        Resource = "*"
      },
      {
        Sid      = "AuditCopies"
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.this["audit"].arn}/*"
      },
    ]
  })
}
