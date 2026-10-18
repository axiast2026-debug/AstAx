# PostgreSQL (Multi-AZ in produzione) and Redis, both encrypted, private.
# The master user is «postgres_admin», managed by RDS in Secrets Manager; the
# roles astax_owner, astax_app and keycloak are created once by the setup task
# (infra/terraform/README.md), as infra/postgres/init does locally.
resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
  tags       = local.tags
}

resource "aws_db_parameter_group" "main" {
  name   = "${local.name}-pg17"
  family = "postgres17"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
  tags = local.tags
}

resource "aws_db_instance" "main" {
  identifier                          = local.name
  engine                              = "postgres"
  engine_version                      = "17"
  instance_class                      = var.db_instance_class
  allocated_storage                   = 50
  max_allocated_storage               = 500
  storage_type                        = "gp3"
  storage_encrypted                   = true
  kms_key_id                          = aws_kms_key.data.arn
  db_name                             = "astax"
  username                            = "postgres_admin"
  manage_master_user_password         = true
  master_user_secret_kms_key_id       = aws_kms_key.data.arn
  multi_az                            = var.db_multi_az
  db_subnet_group_name                = aws_db_subnet_group.main.name
  vpc_security_group_ids              = [aws_security_group.data.id]
  parameter_group_name                = aws_db_parameter_group.main.name
  publicly_accessible                 = false
  backup_retention_period             = var.backup_retention_days
  backup_window                       = "01:00-02:00"
  maintenance_window                  = "sun:02:30-sun:03:30"
  deletion_protection                 = local.production
  skip_final_snapshot                 = !local.production
  final_snapshot_identifier           = local.production ? "${local.name}-final" : null
  copy_tags_to_snapshot               = true
  iam_database_authentication_enabled = false
  performance_insights_enabled        = true
  performance_insights_kms_key_id     = aws_kms_key.data.arn
  auto_minor_version_upgrade          = true
  enabled_cloudwatch_logs_exports     = ["postgresql"]
  tags                                = local.tags
}

resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = local.name
  description                = "AstAx Redis: realtime, tickets, limits, sessions of the web apps"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  num_cache_clusters         = var.redis_replicated ? 2 : 1
  automatic_failover_enabled = var.redis_replicated
  multi_az_enabled           = var.redis_replicated
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.data.id]
  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.data.arn
  transit_encryption_enabled = true
  auth_token                 = random_password.redis.result
  snapshot_retention_limit   = 7
  tags                       = local.tags
}

resource "random_password" "redis" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id     = aws_secretsmanager_secret.app["REDIS_URL"].id
  secret_string = "rediss://:${random_password.redis.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
}
