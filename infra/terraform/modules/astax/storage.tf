# S3 (docs/adattatori.md «File»): documents with SSE-KMS; the audit log copies
# in Object Lock (SIC-04: append only, kept for audit_retention_days);
# CloudTrail and the load balancer's access logs.
locals {
  buckets = {
    documents = { kms = true, object_lock = false }
    audit     = { kms = true, object_lock = true }
    trail     = { kms = true, object_lock = false }
    alb-logs  = { kms = false, object_lock = false }
  }
}

resource "aws_s3_bucket" "this" {
  for_each            = local.buckets
  bucket              = "${local.name}-${each.key}-${local.account_id}"
  object_lock_enabled = each.value.object_lock
  force_destroy       = false
  tags                = local.tags
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each                = aws_s3_bucket.this
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      # The load balancer writes its logs only with S3-managed keys.
      sse_algorithm     = local.buckets[each.key].kms ? "aws:kms" : "AES256"
      kms_master_key_id = local.buckets[each.key].kms ? aws_kms_key.data.arn : null
    }
    bucket_key_enabled = local.buckets[each.key].kms
  }
}

resource "aws_s3_bucket_object_lock_configuration" "audit" {
  bucket = aws_s3_bucket.this["audit"].id
  rule {
    default_retention {
      mode = "COMPLIANCE"
      days = var.audit_retention_days
    }
  }
}

# Only HTTPS, for every bucket.
resource "aws_s3_bucket_policy" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [{
        Sid       = "HttpsOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [each.value.arn, "${each.value.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      }],
      each.key == "trail" ? [
        {
          Sid       = "CloudTrailAcl"
          Effect    = "Allow"
          Principal = { Service = "cloudtrail.amazonaws.com" }
          Action    = "s3:GetBucketAcl"
          Resource  = each.value.arn
        },
        {
          Sid       = "CloudTrailWrite"
          Effect    = "Allow"
          Principal = { Service = "cloudtrail.amazonaws.com" }
          Action    = "s3:PutObject"
          Resource  = "${each.value.arn}/AWSLogs/${local.account_id}/*"
        },
      ] : [],
      each.key == "alb-logs" ? [{
        Sid       = "LoadBalancerLogs"
        Effect    = "Allow"
        Principal = { Service = "logdelivery.elasticloadbalancing.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${each.value.arn}/AWSLogs/${local.account_id}/*"
      }] : [],
    )
  })
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  for_each = { for k in ["trail", "alb-logs"] : k => aws_s3_bucket.this[k] }
  bucket   = each.value.id
  rule {
    id     = "expire-old-logs"
    status = "Enabled"
    filter {}
    expiration {
      days = 400
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}
