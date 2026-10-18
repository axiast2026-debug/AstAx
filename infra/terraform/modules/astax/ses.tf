# Email from the AstAx domain with DKIM; bounces and complaints are counted.
resource "aws_sesv2_email_identity" "domain" {
  email_identity         = var.domain
  configuration_set_name = aws_sesv2_configuration_set.main.configuration_set_name
  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
  tags = local.tags
}

resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  email_identity         = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain       = "mail.${var.domain}"
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

resource "aws_sesv2_configuration_set" "main" {
  configuration_set_name = local.name
  delivery_options {
    tls_policy = "REQUIRE"
  }
  reputation_options {
    reputation_metrics_enabled = true
  }
  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }
  tags = local.tags
}

resource "aws_sesv2_configuration_set_event_destination" "metrics" {
  configuration_set_name = aws_sesv2_configuration_set.main.configuration_set_name
  event_destination_name = "cloudwatch"
  event_destination {
    enabled              = true
    matching_event_types = ["BOUNCE", "COMPLAINT", "REJECT", "DELIVERY_DELAY"]
    cloud_watch_destination {
      dimension_configuration {
        default_dimension_value = "astax"
        dimension_name          = "ses:configuration-set"
        dimension_value_source  = "MESSAGE_TAG"
      }
    }
  }
}
