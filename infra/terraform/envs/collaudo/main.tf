# Environment «collaudo» (phase 8). Nothing is created until Dan says «crea»
# (proposal A): then terraform init and apply from the pipeline, with the
# state in the S3 bucket made by ../../bootstrap.
terraform {
  required_version = ">= 1.16.0"
  backend "s3" {
    key          = "collaudo/terraform.tfstate"
    region       = "eu-south-1"
    encrypt      = true
    use_lockfile = true
    # bucket: given at init (-backend-config="bucket=..."), from the bootstrap output.
  }
}

provider "aws" {
  region = "eu-south-1"
  default_tags {
    tags = { Project = "AstAx", Environment = "collaudo" }
  }
}

module "astax" {
  source                   = "../../modules/astax"
  environment              = "collaudo"
  domain                   = var.domain
  certificate_arn          = var.certificate_arn
  nat_gateways             = 1
  db_instance_class        = "db.t4g.medium"
  db_multi_az              = false
  desired_count            = 1
  image_tag                = var.image_tag
  alarm_email              = var.alarm_email
  github_environment       = "collaudo"
  github_oidc_provider_arn = var.github_oidc_provider_arn
  bedrock_model_id         = var.bedrock_model_id
  temporal_address         = var.temporal_address
  temporal_namespace       = var.temporal_namespace
  otlp_endpoint            = var.otlp_endpoint
}

variable "domain" {
  type    = string
  default = "collaudo.astax.it"
}

variable "certificate_arn" {
  type = string
}

variable "image_tag" {
  type = string
}

variable "alarm_email" {
  type = string
}

variable "github_oidc_provider_arn" {
  type = string
}

variable "bedrock_model_id" {
  type = string
}

variable "temporal_address" {
  type = string
}

variable "temporal_namespace" {
  type = string
}

variable "otlp_endpoint" {
  type    = string
  default = ""
}

output "load_balancer_dns" {
  value = module.astax.load_balancer_dns
}

output "ses_dkim_tokens" {
  value = module.astax.ses_dkim_tokens
}

output "deploy_role_arn" {
  value = module.astax.deploy_role_arn
}
