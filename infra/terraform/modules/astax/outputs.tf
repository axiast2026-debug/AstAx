output "load_balancer_dns" {
  description = "Where the DNS names app., admin., api. and login. must point (CNAME or alias)"
  value       = aws_lb.main.dns_name
}

output "ses_dkim_tokens" {
  description = "The three CNAME records of DKIM for the domain"
  value       = aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}

output "ecr_repositories" {
  value = { for k, r in aws_ecr_repository.app : k => r.repository_url }
}

output "cluster" {
  value = aws_ecs_cluster.main.name
}

output "private_subnets" {
  value = aws_subnet.private[*].id
}

output "services_security_group" {
  value = aws_security_group.services.id
}

output "sealed_bids_key_arn" {
  value = aws_kms_key.sealed_bids.arn
}

output "worker_role_arn" {
  value = aws_iam_role.task["worker"].arn
}

output "api_role_arn" {
  value = aws_iam_role.task["api"].arn
}

output "database_endpoint" {
  value = aws_db_instance.main.address
}
