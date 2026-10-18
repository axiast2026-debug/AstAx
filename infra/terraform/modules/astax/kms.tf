# Keys (docs/busta-chiusa.md, ADR 0005). The account root may manage the keys
# but not use them. For the sealed bids' key it may not even rewrite the
# policy (no kms:PutKeyPolicy): the policy written at creation stays, so no
# IAM grant can ever give the API the sealed bids. Changing it means a new key.
locals {
  key_admin_actions = [
    "kms:Create*", "kms:Describe*", "kms:Enable*", "kms:List*", "kms:Put*", "kms:Update*",
    "kms:Revoke*", "kms:Disable*", "kms:Get*", "kms:Delete*", "kms:TagResource",
    "kms:UntagResource", "kms:ScheduleKeyDeletion", "kms:CancelKeyDeletion",
  ]
  root = "arn:aws:iam::${local.account_id}:root"
}

# BC-03: only the worker's role encrypts and decrypts the auctions' private keys.
resource "aws_kms_key" "sealed_bids" {
  description         = "${local.name} sealed bids (worker only)"
  enable_key_rotation = true
  # Nobody may rewrite this policy, the creator included: AWS asks to confirm it.
  bypass_policy_lockout_safety_check = true
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "KeyAdministration"
        Effect    = "Allow"
        Principal = { AWS = local.root }
        Action    = [for a in local.key_admin_actions : a if a != "kms:Put*"]
        Resource  = "*"
      },
      {
        Sid       = "WorkerUse"
        Effect    = "Allow"
        Principal = { AWS = aws_iam_role.task["worker"].arn }
        Action    = ["kms:Encrypt", "kms:Decrypt"]
        Resource  = "*"
        Condition = { StringEquals = { "kms:EncryptionContext:purpose" = "sealed-bid" } }
      },
      {
        Sid       = "NobodyElseDecrypts"
        Effect    = "Deny"
        Principal = { AWS = "*" }
        Action    = ["kms:Decrypt", "kms:ReEncrypt*", "kms:CreateGrant"]
        Resource  = "*"
        Condition = { StringNotEquals = { "aws:PrincipalArn" = aws_iam_role.task["worker"].arn } }
      },
    ]
  })
  tags = merge(local.tags, { Name = "${local.name}-sealed-bids" })
}

resource "aws_kms_alias" "sealed_bids" {
  name          = "alias/${local.name}-sealed-bids"
  target_key_id = aws_kms_key.sealed_bids.key_id
}

# BC-04: the agencies' own copies of their offers, used by the API only.
resource "aws_kms_key" "offer_owner" {
  description         = "${local.name} offer owner copies (API only)"
  enable_key_rotation = true
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "KeyAdministration"
        Effect    = "Allow"
        Principal = { AWS = local.root }
        Action    = local.key_admin_actions
        Resource  = "*"
      },
      {
        Sid       = "ApiUse"
        Effect    = "Allow"
        Principal = { AWS = aws_iam_role.task["api"].arn }
        Action    = ["kms:Encrypt", "kms:Decrypt"]
        Resource  = "*"
      },
    ]
  })
  tags = merge(local.tags, { Name = "${local.name}-offer-owner" })
}

resource "aws_kms_alias" "offer_owner" {
  name          = "alias/${local.name}-offer-owner"
  target_key_id = aws_kms_key.offer_owner.key_id
}

# Everything else at rest: documents, database, Redis, logs, secrets, backups.
resource "aws_kms_key" "data" {
  description         = "${local.name} data at rest"
  enable_key_rotation = true
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountUse"
        Effect    = "Allow"
        Principal = { AWS = local.root }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "LogsAndTrail"
        Effect    = "Allow"
        Principal = { Service = ["logs.${local.region}.amazonaws.com", "cloudtrail.amazonaws.com"] }
        Action    = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource  = "*"
      },
    ]
  })
  tags = merge(local.tags, { Name = "${local.name}-data" })
}

resource "aws_kms_alias" "data" {
  name          = "alias/${local.name}-data"
  target_key_id = aws_kms_key.data.key_id
}
