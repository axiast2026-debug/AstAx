# The GitHub pipeline of this environment: it assumes this role with OIDC (no
# stored keys) and only from the GitHub environment of the same name, which
# for produzione requires a manual approval.
resource "aws_iam_role" "deploy" {
  name = "${local.name}-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = var.github_oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:${var.github_environment}"
        }
      }
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy" "deploy" {
  role = aws_iam_role.deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "PushImages"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid      = "PushToOurRepositories"
        Effect   = "Allow"
        Action   = ["ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage"]
        Resource = [for r in aws_ecr_repository.app : r.arn]
      },
      {
        # New revisions of our task definitions (they cannot be limited by resource).
        Sid      = "RegisterTasks"
        Effect   = "Allow"
        Action   = ["ecs:RegisterTaskDefinition", "ecs:DescribeTaskDefinition", "ecs:DescribeTasks"]
        Resource = "*"
      },
      {
        # One-off tasks: only the tools, only in this cluster.
        Sid       = "RunOnlyTools"
        Effect    = "Allow"
        Action    = "ecs:RunTask"
        Resource  = "arn:aws:ecs:${local.region}:${local.account_id}:task-definition/${local.name}-tools:*"
        Condition = { ArnEquals = { "ecs:cluster" = aws_ecs_cluster.main.arn } }
      },
      {
        Sid      = "UpdateOurServices"
        Effect   = "Allow"
        Action   = ["ecs:UpdateService", "ecs:DescribeServices"]
        Resource = "arn:aws:ecs:${local.region}:${local.account_id}:service/${local.name}/*"
      },
      {
        # The pipeline is the trusted path that ships code, protected by Dan's
        # approval, the branch main and a green CI (deploy.yml); an early use of
        # the sealed bids' key by any role is caught by the nightly check (BC-03).
        Sid       = "PassOnlyOurRolesToEcs"
        Effect    = "Allow"
        Action    = "iam:PassRole"
        Resource  = concat([for r in aws_iam_role.task : r.arn], [for r in aws_iam_role.execution : r.arn])
        Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } }
      },
      {
        Sid      = "ReadToolsLogs"
        Effect   = "Allow"
        Action   = ["logs:GetLogEvents"]
        Resource = "${aws_cloudwatch_log_group.service["tools"].arn}:*"
      },
    ]
  })
}
