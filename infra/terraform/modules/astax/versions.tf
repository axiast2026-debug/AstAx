terraform {
  required_version = ">= 1.16.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.66.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "3.7.2"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name       = "astax-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
  production = var.environment == "produzione"
  tags = {
    Project     = "AstAx"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
