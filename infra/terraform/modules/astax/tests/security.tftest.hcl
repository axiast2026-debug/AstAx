# Phase 8 criteria on the infrastructure, checked offline with a simulated AWS
# (mock provider): run with `terraform test` in modules/astax.
mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111122223333" }
  }
  mock_data "aws_region" {
    defaults = { region = "eu-south-1" }
  }
  mock_data "aws_availability_zones" {
    defaults = { names = ["eu-south-1a", "eu-south-1b", "eu-south-1c"] }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111122223333:role/mock" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:eu-south-1:111122223333:key/mock" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:eu-south-1:111122223333:loadbalancer/app/mock/1" }
  }
  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:eu-south-1:111122223333:listener/app/mock/1/1" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:eu-south-1:111122223333:targetgroup/mock/1" }
  }
  mock_resource "aws_service_discovery_service" {
    defaults = { arn = "arn:aws:servicediscovery:eu-south-1:111122223333:service/srv-mock" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:eu-south-1:111122223333:log-group:mock" }
  }
  mock_resource "aws_wafv2_web_acl" {
    defaults = { arn = "arn:aws:wafv2:eu-south-1:111122223333:regional/webacl/mock/1" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:eu-south-1:111122223333:mock" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:eu-south-1:111122223333:secret:mock" }
  }
  mock_resource "aws_ecr_repository" {
    defaults = { arn = "arn:aws:ecr:eu-south-1:111122223333:repository/mock" }
  }
  mock_resource "aws_db_instance" {
    defaults = { arn = "arn:aws:rds:eu-south-1:111122223333:db:mock" }
  }
  mock_resource "aws_ecs_cluster" {
    defaults = { arn = "arn:aws:ecs:eu-south-1:111122223333:cluster/mock" }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:eu-south-1:111122223333:task-definition/mock:1" }
  }
  mock_resource "aws_backup_vault" {
    defaults = { arn = "arn:aws:backup:eu-south-1:111122223333:backup-vault:mock" }
  }
}

mock_provider "random" {
  mock_resource "random_password" {
    defaults = { result = "MockRedisTokenWithEnoughLength0123456789" }
  }
}

variables {
  environment              = "collaudo"
  domain                   = "collaudo.astax.example"
  certificate_arn          = "arn:aws:acm:eu-south-1:111122223333:certificate/mock"
  image_tag                = "test"
  alarm_email              = "reperibile@astax.example"
  github_environment       = "collaudo"
  github_oidc_provider_arn = "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
  bedrock_model_id         = "eu.anthropic.claude-test"
  temporal_address         = "astax-collaudo.test.tmprl.cloud:7233"
  temporal_namespace       = "astax-collaudo.test"
}

override_resource {
  target = aws_iam_role.task["worker"]
  values = { arn = "arn:aws:iam::111122223333:role/astax-collaudo-worker" }
}

override_resource {
  target = aws_iam_role.task["api"]
  values = { arn = "arn:aws:iam::111122223333:role/astax-collaudo-api" }
}

override_resource {
  target = aws_kms_key.sealed_bids
  values = { arn = "arn:aws:kms:eu-south-1:111122223333:key/sealed" }
}

run "bc03_only_the_worker_decrypts_the_sealed_bids" {
  command = apply

  # Whoever is allowed to decrypt, it is the worker's role only.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_kms_key.sealed_bids.policy).Statement :
      s.Principal.AWS == "arn:aws:iam::111122223333:role/astax-collaudo-worker"
      if s.Effect == "Allow" && contains(flatten([s.Action]), "kms:Decrypt")
    ])
    error_message = "Only the worker may be allowed to decrypt the sealed bids' key."
  }

  # The account root administers the key but can neither use it nor rewrite its
  # policy, so no IAM grant can ever open it.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_kms_key.sealed_bids.policy).Statement :
      !contains(flatten([s.Action]), "kms:*") && !contains(flatten([s.Action]), "kms:Decrypt") &&
      !contains(flatten([s.Action]), "kms:Put*") && !contains(flatten([s.Action]), "kms:PutKeyPolicy")
      if s.Effect == "Allow" && s.Principal.AWS == "arn:aws:iam::111122223333:root"
    ])
    error_message = "The root of the account must neither use the sealed bids' key nor rewrite its policy."
  }

  # And an explicit deny for every other principal, the API's role included.
  assert {
    condition = anytrue([
      for s in jsondecode(aws_kms_key.sealed_bids.policy).Statement :
      s.Effect == "Deny" && contains(flatten([s.Action]), "kms:Decrypt") &&
      s.Condition.StringNotEquals["aws:PrincipalArn"] == "arn:aws:iam::111122223333:role/astax-collaudo-worker"
    ])
    error_message = "A deny must cover every principal but the worker."
  }

  # The API's own policy never names the sealed bids' key.
  assert {
    condition     = !strcontains(aws_iam_role_policy.api.policy, "key/sealed")
    error_message = "The API's role must not reference the sealed bids' key."
  }
}

run "bc04_the_worker_cannot_use_the_offer_owner_key" {
  command = apply

  assert {
    condition = alltrue([
      for s in jsondecode(aws_kms_key.offer_owner.policy).Statement :
      s.Principal.AWS != "arn:aws:iam::111122223333:role/astax-collaudo-worker"
    ])
    error_message = "The worker must not use the agencies' own copies key."
  }
}

run "sic04_audit_copies_are_append_only_and_storage_is_private" {
  command = apply

  assert {
    condition     = aws_s3_bucket.this["audit"].object_lock_enabled == true
    error_message = "The audit bucket needs Object Lock."
  }
  assert {
    condition     = aws_s3_bucket_object_lock_configuration.audit.rule[0].default_retention[0].mode == "COMPLIANCE"
    error_message = "The audit copies must be locked in COMPLIANCE mode."
  }
  assert {
    condition = alltrue([
      for b in aws_s3_bucket_public_access_block.this :
      b.block_public_acls && b.block_public_policy && b.ignore_public_acls && b.restrict_public_buckets
    ])
    error_message = "No bucket may be public."
  }
  assert {
    condition     = aws_db_instance.main.storage_encrypted && !aws_db_instance.main.publicly_accessible
    error_message = "The database must be encrypted and private."
  }
  assert {
    condition     = aws_elasticache_replication_group.main.transit_encryption_enabled && aws_elasticache_replication_group.main.at_rest_encryption_enabled
    error_message = "Redis must be encrypted at rest and in transit."
  }
}

run "rule13_no_development_tools_or_fake_providers_in_the_containers" {
  command = apply

  assert {
    condition = alltrue([
      for k, c in local.containers : lookup(c.env, "DEV_TOOLS", "false") == "false"
    ])
    error_message = "DEV_TOOLS must be off in every container."
  }
  assert {
    condition = alltrue(flatten([
      for k, c in local.containers : [
        for name, value in c.env : value != "fake" if endswith(name, "_PROVIDER")
      ]
    ]))
    error_message = "No container may use a fake provider."
  }
  # API and worker carry every provider of the common settings, the ones the
  # release gate reads in the tools task.
  assert {
    condition = alltrue(flatten([
      for svc in ["api", "worker"] : [
        for name, value in local.backend_env : lookup(local.containers[svc].env, name, "") == value
        if endswith(name, "_PROVIDER")
      ]
    ]))
    error_message = "API and worker must run with the providers the release gate checked."
  }
}

run "produzione_is_multi_az_and_protected" {
  command = apply
  variables {
    environment        = "produzione"
    db_multi_az        = true
    nat_gateways       = 3
    github_environment = "produzione"
  }

  assert {
    condition     = aws_db_instance.main.multi_az && aws_db_instance.main.deletion_protection
    error_message = "Production database: Multi-AZ and deletion protection."
  }
  assert {
    condition     = aws_lb.main.enable_deletion_protection
    error_message = "Production load balancer: deletion protection."
  }
}
