# Network: three zones of eu-south-1 (Milan), public subnets for the load
# balancer and the NAT, private subnets for the services and the data.
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  zones = slice(data.aws_availability_zones.available.names, 0, 3)
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = merge(local.tags, { Name = local.name })
}

resource "aws_subnet" "public" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  availability_zone = local.zones[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index)
  tags              = merge(local.tags, { Name = "${local.name}-public-${count.index}" })
}

resource "aws_subnet" "private" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  availability_zone = local.zones[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 8)
  tags              = merge(local.tags, { Name = "${local.name}-private-${count.index}" })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = local.tags
}

resource "aws_eip" "nat" {
  count  = var.nat_gateways
  domain = "vpc"
  tags   = local.tags
}

resource "aws_nat_gateway" "main" {
  count         = var.nat_gateways
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  tags          = local.tags
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = local.tags
}

resource "aws_route_table_association" "public" {
  count          = 3
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  count  = 3
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index % var.nat_gateways].id
  }
  tags = local.tags
}

resource "aws_route_table_association" "private" {
  count          = 3
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# S3 without leaving the AWS network.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${local.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id
  tags              = local.tags
}

# Nothing may use the default security group.
resource "aws_default_security_group" "default" {
  vpc_id = aws_vpc.main.id
  tags   = local.tags
}

resource "aws_flow_log" "main" {
  vpc_id               = aws_vpc.main.id
  traffic_type         = "REJECT"
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.flow.arn
  iam_role_arn         = aws_iam_role.flow_logs.arn
}

resource "aws_cloudwatch_log_group" "flow" {
  name              = "/astax/${var.environment}/vpc-flow"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.data.arn
  tags              = local.tags
}

resource "aws_iam_role" "flow_logs" {
  name = "${local.name}-flow-logs"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy" "flow_logs" {
  role = aws_iam_role.flow_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
      Resource = "${aws_cloudwatch_log_group.flow.arn}:*"
    }]
  })
}

# Security groups: the balancer talks to the services; the services to the data.
resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Load balancer: HTTPS from the internet"
  vpc_id      = aws_vpc.main.id
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTP, redirected to HTTPS"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    description = "To the services in the VPC"
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }
  tags = local.tags
}

resource "aws_security_group" "services" {
  name        = "${local.name}-services"
  description = "ECS services: from the balancer and from each other"
  vpc_id      = aws_vpc.main.id
  ingress {
    description     = "From the load balancer"
    from_port       = 3000
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  ingress {
    description = "Between services (web and admin call the API, everyone calls Keycloak)"
    from_port   = 3000
    to_port     = 8080
    protocol    = "tcp"
    self        = true
  }
  egress {
    description = "HTTPS to AWS services and providers, data stores in the VPC"
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = local.tags
}

resource "aws_security_group" "data" {
  name        = "${local.name}-data"
  description = "PostgreSQL and Redis: only from the services"
  vpc_id      = aws_vpc.main.id
  ingress {
    description     = "PostgreSQL"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.services.id]
  }
  ingress {
    description     = "Redis"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.services.id]
  }
  tags = local.tags
}
