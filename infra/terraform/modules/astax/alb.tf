# The only door from the internet: HTTPS with a modern TLS policy, by host name.
resource "aws_lb" "main" {
  name                       = local.name
  load_balancer_type         = "application"
  internal                   = false
  subnets                    = aws_subnet.public[*].id
  security_groups            = [aws_security_group.alb.id]
  drop_invalid_header_fields = true
  enable_deletion_protection = local.production
  access_logs {
    bucket  = aws_s3_bucket.this["alb-logs"].bucket
    enabled = true
  }
  tags = local.tags
}

locals {
  hosts = {
    web      = "app.${var.domain}"
    admin    = "admin.${var.domain}"
    api      = "api.${var.domain}"
    keycloak = "login.${var.domain}"
  }
  health_paths = {
    web      = "/"
    admin    = "/"
    api      = "/health"
    keycloak = "/realms/astax/.well-known/openid-configuration"
  }
}

resource "aws_lb_target_group" "service" {
  for_each    = local.hosts
  name        = "${local.name}-${each.key}"
  port        = local.containers[each.key].port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id
  health_check {
    path                = local.health_paths[each.key]
    port                = "traffic-port"
    matcher             = "200-399"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
  }
  deregistration_delay = 30
  tags                 = local.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "host" {
  for_each     = local.hosts
  listener_arn = aws_lb_listener.https.arn
  priority     = index(keys(local.hosts), each.key) + 10
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service[each.key].arn
  }
  condition {
    host_header {
      values = [each.value]
    }
  }
}

# Keycloak's administration console never from the internet.
resource "aws_lb_listener_rule" "no_keycloak_admin" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 1
  action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }
  condition {
    host_header {
      values = [local.hosts.keycloak]
    }
  }
  condition {
    path_pattern {
      values = ["/admin/master/console*", "/admin/*/console*"]
    }
  }
}
