# Alarms (docs/sorveglianza.md): a metric filter on the services' log lines
# with the field «alarm», and the classic CloudTrail checks; all to one topic.
resource "aws_sns_topic" "alarms" {
  name              = "${local.name}-alarms"
  kms_master_key_id = aws_kms_key.data.id
  tags              = local.tags
}

resource "aws_sns_topic_policy" "alarms" {
  arn = aws_sns_topic.alarms.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudwatch.amazonaws.com" }
      Action    = "sns:Publish"
      Resource  = aws_sns_topic.alarms.arn
    }]
  })
}

resource "aws_sns_topic_subscription" "on_call" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

locals {
  alarms = {
    workflow-step-failing = {
      group = "worker", pattern = "{ $.alarm = \"WORKFLOW_STEP_FAILING\" }", threshold = 1, period = 300
    }
    auction-close-late = {
      group = "worker", pattern = "{ $.alarm = \"AUCTION_CLOSE_LATE\" }", threshold = 1, period = 300
    }
    issuance-deadline-missed = {
      group = "worker", pattern = "{ $.alarm = \"ISSUANCE_DEADLINE_MISSED\" }", threshold = 1, period = 3600
    }
    kms-anomaly = {
      group = "worker", pattern = "{ $.alarm = \"KMS_ANOMALY\" }", threshold = 1, period = 300
    }
    webhook-errors = {
      group = "api", pattern = "{ ($.msg = \"request\") && ($.path = \"/webhooks*\") && ($.status >= 400) }", threshold = 5, period = 900
    }
    api-errors = {
      group = "api", pattern = "{ $.level >= 50 }", threshold = 10, period = 300
    }
    worker-errors = {
      group = "worker", pattern = "{ $.level >= 50 }", threshold = 10, period = 300
    }
  }
  trail_alarms = {
    root-account-used = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"
    access-denied     = "{ ($.errorCode = \"*UnauthorizedOperation\") || ($.errorCode = \"AccessDenied*\") }"
    kms-key-disabled  = "{ ($.eventSource = kms.amazonaws.com) && (($.eventName = DisableKey) || ($.eventName = ScheduleKeyDeletion) || ($.eventName = PutKeyPolicy)) }"
    iam-changed       = "{ ($.eventSource = iam.amazonaws.com) && (($.eventName = Put*Policy) || ($.eventName = Attach*Policy) || ($.eventName = CreateAccessKey)) }"
  }
}

resource "aws_cloudwatch_log_metric_filter" "service" {
  for_each       = local.alarms
  name           = each.key
  log_group_name = aws_cloudwatch_log_group.service[each.value.group].name
  pattern        = each.value.pattern
  metric_transformation {
    name          = each.key
    namespace     = "AstAx/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "service" {
  for_each            = local.alarms
  alarm_name          = "${local.name}-${each.key}"
  namespace           = "AstAx/${var.environment}"
  metric_name         = each.key
  statistic           = "Sum"
  period              = each.value.period
  evaluation_periods  = 1
  threshold           = each.value.threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  tags                = local.tags
}

resource "aws_cloudwatch_log_metric_filter" "trail" {
  for_each       = local.trail_alarms
  name           = each.key
  log_group_name = aws_cloudwatch_log_group.trail.name
  pattern        = each.value
  metric_transformation {
    name          = each.key
    namespace     = "AstAx/${var.environment}/trail"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "trail" {
  for_each            = local.trail_alarms
  alarm_name          = "${local.name}-trail-${each.key}"
  namespace           = "AstAx/${var.environment}/trail"
  metric_name         = each.key
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = each.key == "access-denied" ? 10 : 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  tags                = local.tags
}
