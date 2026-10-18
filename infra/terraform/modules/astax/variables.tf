variable "environment" {
  description = "collaudo o produzione"
  type        = string
  validation {
    condition     = contains(["collaudo", "produzione"], var.environment)
    error_message = "environment must be collaudo or produzione."
  }
}

variable "domain" {
  description = "The public domain of the environment, e.g. collaudo.astax.it or astax.it"
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate (eu-south-1) for app., admin., api. and login. of the domain"
  type        = string
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "nat_gateways" {
  description = "1 in collaudo; one per zone in produzione"
  type        = number
  default     = 1
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "db_multi_az" {
  type    = bool
  default = false
}

variable "redis_replicated" {
  description = "Two Redis nodes with failover; one node in the starting version (question 24)"
  type        = bool
  default     = false
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}

variable "image_tag" {
  description = "The tag of the images to run (the commit of the release)"
  type        = string
}

variable "desired_count" {
  description = "Tasks per service (api, web, admin, keycloak); the worker runs 2"
  type        = number
  default     = 2
}

variable "alarm_email" {
  description = "Who receives the alarms (the person on call)"
  type        = string
}

variable "audit_retention_days" {
  description = "Object Lock retention of the audit log copies (SIC-04)"
  type        = number
  default     = 3650
}

variable "backup_retention_days" {
  type    = number
  default = 35
}

variable "github_repository" {
  description = "owner/name of the repository whose pipeline may deploy"
  type        = string
  default     = "axiast2026-debug/AstAx"
}

variable "github_environment" {
  description = "The GitHub environment whose jobs may assume the deploy role"
  type        = string
}

variable "github_oidc_provider_arn" {
  description = "The GitHub OIDC provider of the account (bootstrap)"
  type        = string
}

variable "bedrock_model_id" {
  description = "EU inference profile of Claude on Bedrock"
  type        = string
}

variable "temporal_address" {
  description = "Temporal Cloud endpoint of the namespace (ADR 0012)"
  type        = string
}

variable "temporal_namespace" {
  type = string
}

variable "otlp_endpoint" {
  description = "OTLP endpoint of Grafana Cloud (EU) for the timings; empty to keep them off"
  type        = string
  default     = ""
}
