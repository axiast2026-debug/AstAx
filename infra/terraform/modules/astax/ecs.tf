# Containers on ECS Fargate in the private subnets. Images from ECR, tagged
# with the commit of the release; configuration from here and Secrets Manager.
resource "aws_ecr_repository" "app" {
  for_each             = toset(["api", "worker", "web", "admin", "keycloak", "tools"])
  name                 = "astax/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.data.arn
  }
  tags = local.tags
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = local.services
  name              = "/astax/${var.environment}/${each.key}"
  retention_in_days = local.production ? 400 : 90
  kms_key_id        = aws_kms_key.data.arn
  tags              = local.tags
}

resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  tags = local.tags
}

# Names inside the VPC: web and admin call the API at api.astax.internal.
resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "astax.internal"
  vpc  = aws_vpc.main.id
  tags = local.tags
}

resource "aws_service_discovery_service" "api" {
  name = "api"
  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id
    dns_records {
      ttl  = 10
      type = "A"
    }
  }
  health_check_custom_config {}
}

locals {
  urls = {
    web   = "https://app.${var.domain}"
    admin = "https://admin.${var.domain}"
    api   = "https://api.${var.domain}"
    login = "https://login.${var.domain}"
  }
  internal_api = "http://api.astax.internal:4000"

  # Common settings of API and worker (docs/adattatori.md: the real providers).
  backend_env = {
    NODE_ENV                    = "production"
    DEV_TOOLS                   = "false"
    LOG_LEVEL                   = "info"
    AWS_REGION                  = local.region
    WEB_URL                     = local.urls.web
    ADMIN_URL                   = local.urls.admin
    KEYCLOAK_URL                = local.urls.login
    KEYCLOAK_REALM              = "astax"
    EMAIL_FROM                  = "noreply@${var.domain}"
    EMAIL_PROVIDER              = "ses"
    SES_CONFIGURATION_SET       = aws_sesv2_configuration_set.main.configuration_set_name
    SMS_PROVIDER                = "aws"
    SMS_ORIGINATOR              = "AstAx"
    PUSH_PROVIDER               = "vapid"
    VAPID_SUBJECT               = "mailto:sicurezza@${var.domain}"
    KMS_PROVIDER                = "aws"
    AI_PROVIDER                 = "bedrock"
    BEDROCK_MODEL_ID            = var.bedrock_model_id
    PLATE_PROVIDER              = "openapi"
    OPENAPI_AUTOMOTIVE_URL      = local.production ? "https://automotive.openapi.com" : "https://test.automotive.openapi.com"
    SDI_PROVIDER                = "openapi"
    OPENAPI_SDI_URL             = local.production ? "https://sdi.openapi.it" : "https://test.sdi.openapi.it"
    STORAGE_PROVIDER            = "aws"
    S3_REGION                   = local.region
    S3_BUCKET                   = aws_s3_bucket.this["documents"].bucket
    TEMPORAL_ADDRESS            = var.temporal_address
    TEMPORAL_NAMESPACE          = var.temporal_namespace
    SENTRY_ENVIRONMENT          = var.environment
    RELEASE                     = var.image_tag
    OTEL_EXPORTER_OTLP_ENDPOINT = var.otlp_endpoint
  }

  backend_secrets = {
    DATABASE_URL               = "DATABASE_URL_APP"
    FIELD_ENCRYPTION_KEY       = "FIELD_ENCRYPTION_KEY"
    BLIND_INDEX_KEY            = "BLIND_INDEX_KEY"
    KEYCLOAK_API_ADMIN_SECRET  = "KEYCLOAK_API_ADMIN_SECRET"
    REDIS_URL                  = "REDIS_URL"
    VAPID_PUBLIC_KEY           = "VAPID_PUBLIC_KEY"
    VAPID_PRIVATE_KEY          = "VAPID_PRIVATE_KEY"
    TEMPORAL_API_KEY           = "TEMPORAL_API_KEY"
    SENTRY_DSN                 = "SENTRY_DSN"
    OTEL_EXPORTER_OTLP_HEADERS = "OTEL_EXPORTER_OTLP_HEADERS"
  }

  web_env = {
    NODE_ENV          = "production"
    API_URL           = local.internal_api
    API_PUBLIC_URL    = local.urls.api
    WEB_URL           = local.urls.web
    ADMIN_URL         = local.urls.admin
    KEYCLOAK_URL      = local.urls.login
    KEYCLOAK_REALM    = "astax"
    WEB_TRUSTED_PROXY = "true"
  }

  containers = {
    web = {
      port    = 3000
      env     = local.web_env
      secrets = { REDIS_URL = "REDIS_URL", VAPID_PUBLIC_KEY = "VAPID_PUBLIC_KEY" }
    }
    admin = {
      port    = 3000
      env     = local.web_env
      secrets = { REDIS_URL = "REDIS_URL" }
    }
    api = {
      port = 4000
      env = merge(local.backend_env, {
        API_HOST               = "0.0.0.0"
        API_PORT               = "4000"
        API_TRUST_PROXY        = var.vpc_cidr
        IDENTITY_SYNC_ON_START = "true"
        KMS_OFFER_OWNER_KEY_ID = aws_kms_key.offer_owner.arn
      })
      secrets = merge(local.backend_secrets, {
        OPENAPI_AUTOMOTIVE_TOKEN   = "OPENAPI_AUTOMOTIVE_TOKEN"
        OPENAPI_SDI_TOKEN          = "OPENAPI_SDI_TOKEN"
        OPENAPI_SDI_WEBHOOK_SECRET = "OPENAPI_SDI_WEBHOOK_SECRET"
      })
    }
    worker = {
      port = 4100
      env = merge(local.backend_env, {
        WORKER_HEALTH_HOST     = "0.0.0.0"
        WORKER_HEALTH_PORT     = "4100"
        KMS_SEALED_BIDS_KEY_ID = aws_kms_key.sealed_bids.arn
        KMS_WORKER_ROLE_ARN    = aws_iam_role.task["worker"].arn
      })
      secrets = local.backend_secrets
    }
    keycloak = {
      port = 8080
      env = {
        KC_DB                       = "postgres"
        KC_DB_URL                   = "jdbc:postgresql://${aws_db_instance.main.address}:5432/keycloak?sslmode=require"
        KC_DB_USERNAME              = "keycloak"
        KC_HOSTNAME                 = local.urls.login
        KC_HTTP_ENABLED             = "true"
        KC_PROXY_HEADERS            = "xforwarded"
        KC_HEALTH_ENABLED           = "true"
        KC_BOOTSTRAP_ADMIN_USERNAME = "astax-bootstrap"
      }
      secrets = {
        KC_DB_PASSWORD              = "KEYCLOAK_DB_PASSWORD"
        KC_BOOTSTRAP_ADMIN_PASSWORD = "KEYCLOAK_ADMIN_PASSWORD"
      }
    }
  }
}

resource "aws_ecs_task_definition" "service" {
  for_each                 = local.containers
  family                   = "${local.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.key == "keycloak" ? 1024 : 512
  memory                   = each.key == "keycloak" ? 2048 : 1024
  execution_role_arn       = aws_iam_role.execution[each.key].arn
  task_role_arn            = aws_iam_role.task[each.key].arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  container_definitions = jsonencode([{
    name         = each.key
    image        = "${aws_ecr_repository.app[each.key].repository_url}:${var.image_tag}"
    essential    = true
    command      = each.key == "keycloak" ? ["start"] : null
    portMappings = [{ containerPort = each.value.port, protocol = "tcp" }]
    environment  = [for k, v in each.value.env : { name = k, value = v }]
    secrets = [for k, v in each.value.secrets : {
      name      = k
      valueFrom = aws_secretsmanager_secret.app[v].arn
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service[each.key].name
        awslogs-region        = local.region
        awslogs-stream-prefix = each.key
      }
    }
  }])
  tags = local.tags
}

resource "aws_ecs_service" "service" {
  for_each               = local.containers
  name                   = each.key
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.service[each.key].arn
  desired_count          = each.key == "worker" ? 2 : var.desired_count
  launch_type            = "FARGATE"
  enable_execute_command = false
  propagate_tags         = "SERVICE"
  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.services.id]
    assign_public_ip = false
  }
  dynamic "load_balancer" {
    for_each = each.key == "worker" ? [] : [each.key]
    content {
      target_group_arn = aws_lb_target_group.service[each.key].arn
      container_name   = each.key
      container_port   = each.value.port
    }
  }
  dynamic "service_registries" {
    for_each = each.key == "api" ? [1] : []
    content {
      registry_arn = aws_service_discovery_service.api.arn
    }
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  tags = local.tags
}

# One-off tasks of the pipeline: migrations, the release gate, the roles' setup.
resource "aws_ecs_task_definition" "tools" {
  family                   = "${local.name}-tools"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution["tools"].arn
  task_role_arn            = aws_iam_role.task["tools"].arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  container_definitions = jsonencode([{
    name        = "tools"
    image       = "${aws_ecr_repository.app["tools"].repository_url}:${var.image_tag}"
    essential   = true
    environment = [for k, v in local.backend_env : { name = k, value = v }]
    secrets = [
      { name = "DATABASE_OWNER_URL", valueFrom = aws_secretsmanager_secret.app["DATABASE_URL_OWNER"].arn },
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.app["DATABASE_URL_OWNER"].arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service["tools"].name
        awslogs-region        = local.region
        awslogs-stream-prefix = "tools"
      }
    }
  }])
  tags = local.tags
}
