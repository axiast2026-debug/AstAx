#!/usr/bin/env bash
# Online demo (ADR 0020): first preparation of a fresh Ubuntu 24.04 server.
#   ssh root@<server> 'bash -s' < infra/demo/setup-server.sh astaxapp.com
# Security updates by themselves, SSH with keys only, Docker, a firewall that
# lets in Cloudflare only on 80 and 443, the nightly database copy.
set -euo pipefail

DOMAIN="${1:?usage: setup-server.sh <domain>}"
export DEBIAN_FRONTEND=noninteractive

apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl git ufw unattended-upgrades fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

# 4 GB of swap: the CAX11 has 4 GB of memory, and a slow page beats a stopped service.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
echo 'vm.swappiness=20' >/etc/sysctl.d/90-astax-swap.conf
sysctl -q -p /etc/sysctl.d/90-astax-swap.conf

# SSH: keys only, never passwords.
cat >/etc/ssh/sshd_config.d/10-astax.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
# Ubuntu 26.04 starts sshd per connection (ssh.socket): the new rules apply at the next login.
systemctl try-reload-or-restart ssh.service 2>/dev/null || true

# Docker from its official repository.
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# Firewall: SSH from anywhere (keys only), web from Cloudflare only.
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
for range in $(curl -fsSL https://www.cloudflare.com/ips-v4) $(curl -fsSL https://www.cloudflare.com/ips-v6); do
  ufw allow proto tcp from "$range" to any port 80,443
done
ufw --force enable
# Docker publishes ports past ufw: the same rule in Docker's own chain.
cat >/etc/astax-cloudflare.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
iptables -N ASTAX-WEB 2>/dev/null || iptables -F ASTAX-WEB
for range in $(curl -fsSL https://www.cloudflare.com/ips-v4); do
  iptables -A ASTAX-WEB -s "$range" -j RETURN
done
iptables -A ASTAX-WEB -j DROP
iptables -C DOCKER-USER -p tcp -m multiport --dports 80,443 -j ASTAX-WEB 2>/dev/null \
  || iptables -I DOCKER-USER -p tcp -m multiport --dports 80,443 -j ASTAX-WEB
EOF
chmod 700 /etc/astax-cloudflare.sh
cat >/etc/systemd/system/astax-cloudflare.service <<'EOF'
[Unit]
Description=AstAx demo: web ports open to Cloudflare only
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/etc/astax-cloudflare.sh

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now astax-cloudflare.service

# The repository (public) and the folders of the demo.
mkdir -p /opt/astax/backups
[ -d /opt/astax/repo ] || git clone -q https://github.com/axiast2026-debug/AstAx.git /opt/astax/repo
chmod 700 /opt/astax

# Nightly copy of the database, kept 7 days (Hetzner's backup covers the rest).
cat >/etc/cron.daily/astax-db-backup <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/astax/repo
docker compose --env-file /opt/astax/demo.env -f infra/demo/compose.yml exec -T postgres \
  pg_dump -U postgres -Fc astax >"/opt/astax/backups/astax-$(date +%F).dump"
find /opt/astax/backups -name 'astax-*.dump' -mtime +7 -delete
EOF
chmod 700 /etc/cron.daily/astax-db-backup

bash /opt/astax/repo/infra/demo/make-env.sh "$DOMAIN"
echo "Server ready. Next: deploy.sh <commit>."
