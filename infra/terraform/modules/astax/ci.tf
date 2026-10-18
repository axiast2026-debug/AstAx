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
        Sid      = "RunToolsAndDeploy"
        Effect   = "Allow"
        Action   = ["ecs:RunTask", "ecs:DescribeTasks", "ecs:RegisterTaskDefinition", "ecs:UpdateService", "ecs:DescribeServices", "ecs:DescribeTaskDefinition"]
        Resource = "*"
      },
      {
        Sid      = "PassOnlyOurRoles"
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = concat([for r in aws_iam_role.task : r.arn], [for r in aws_iam_role.execution : r.arn])
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
