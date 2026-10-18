# CloudTrail (every KMS use included, for the nightly check of BC-03) and the
# backups (RDS snapshots on top of its point-in-time recovery).
resource "aws_cloudtrail" "main" {
  name                          = local.name
  s3_bucket_name                = aws_s3_bucket.this["trail"].id
  kms_key_id                    = aws_kms_key.data.arn
  is_multi_region_trail         = true
  include_global_service_events = true
  enable_log_file_validation    = true
  cloud_watch_logs_group_arn    = "${aws_cloudwatch_log_group.trail.arn}:*"
  cloud_watch_logs_role_arn     = aws_iam_role.trail.arn
  depends_on                    = [aws_s3_bucket_policy.this]
  tags                          = local.tags
}

resource "aws_cloudwatch_log_group" "trail" {
  name              = "/astax/${var.environment}/cloudtrail"
  retention_in_days = 400
  kms_key_id        = aws_kms_key.data.arn
  tags              = local.tags
}

resource "aws_iam_role" "trail" {
  name = "${local.name}-cloudtrail"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudtrail.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy" "trail" {
  role = aws_iam_role.trail.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.trail.arn}:*"
    }]
  })
}

resource "aws_backup_vault" "main" {
  name        = local.name
  kms_key_arn = aws_kms_key.data.arn
  tags        = local.tags
}

resource "aws_backup_plan" "main" {
  name = local.name
  rule {
    rule_name         = "daily"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 2 * * ? *)"
    lifecycle {
      delete_after = var.backup_retention_days
    }
  }
  tags = local.tags
}

resource "aws_iam_role" "backup" {
  name = "${local.name}-backup"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "backup.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_backup_selection" "main" {
  name         = local.name
  plan_id      = aws_backup_plan.main.id
  iam_role_arn = aws_iam_role.backup.arn
  resources    = [aws_db_instance.main.arn, aws_s3_bucket.this["documents"].arn]
}
