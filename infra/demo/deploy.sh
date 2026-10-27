#!/usr/bin/env bash
# Online demo (ADR 0020): brings the server to the images of one commit of main.
#   sudo /opt/astax/repo/infra/demo/deploy.sh <commit>
# Steps: the repository at that commit, the images, the migrations, the seed of
# synthetic data and test users, Keycloak's addresses and SMTP, every service up.
# It never prints a secret (rule 12) and never resets the database.
set -euo pipefail

COMMIT="${1:?usage: deploy.sh <commit of main>}"
ENV_FILE=/opt/astax/demo.env
REPO=/opt/astax/repo
[ -e "$ENV_FILE" ] || { echo "Run make-env.sh first."; exit 1; }

cd "$REPO"
git fetch -q origin main
git checkout -q --detach "$COMMIT"
TAG=$(git rev-parse --short=12 HEAD)
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$TAG/" "$ENV_FILE"
echo "Demo at commit $TAG."

compose() { docker compose --env-file "$ENV_FILE" -f infra/demo/compose.yml "$@"; }

compose pull -q
compose --profile tools pull -q tools
compose up -d --wait postgres redis temporal storage mailpit keycloak

# Migrations, then parameters, lists and synthetic data, then the test users (rule 11).
compose run --rm tools pnpm db:migrate
# Keycloak's administration is reached inside: from outside Caddy refuses /admin.
compose run --rm -e KEYCLOAK_URL=http://keycloak:8080 tools pnpm db:seed

# Keycloak: the realm of the repository speaks of localhost; here it gets the
# demo's addresses and Resend's SMTP (the key only from demo.env).
compose exec -T keycloak bash -s <<'EOF'
set -euo pipefail
kc=/opt/keycloak/bin/kcadm.sh
$kc config credentials --server http://localhost:8080 --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
set_client() {
  local client_id=$1 url=$2 id
  id=$($kc get clients -r astax -q clientId="$client_id" --fields id --format csv --noquotes)
  $kc update "clients/$id" -r astax \
    -s "redirectUris=[\"$url/*\"]" -s "webOrigins=[\"$url\"]" \
    -s "attributes.\"post.logout.redirect.uris\"=$url/*"
}
set_client astax-web-private "$WEB_URL"
set_client astax-web-pro "$WEB_URL"
set_client astax-admin "$ADMIN_URL"
if [ -n "${RESEND_API_KEY:-}" ]; then
  $kc update realms/astax \
    -s 'smtpServer.host=smtp.resend.com' -s 'smtpServer.port=465' \
    -s "smtpServer.from=$EMAIL_FROM" -s 'smtpServer.fromDisplayName=AstAx demo' \
    -s 'smtpServer.auth=true' -s 'smtpServer.user=resend' \
    -s "smtpServer.password=$RESEND_API_KEY" \
    -s 'smtpServer.ssl=true' -s 'smtpServer.starttls=false'
else
  echo "No Resend key yet: Keycloak's email stays on Mailpit."
  $kc update realms/astax -s 'smtpServer.host=mailpit' -s 'smtpServer.port=1025' \
    -s "smtpServer.from=$EMAIL_FROM" -s 'smtpServer.auth=false' -s 'smtpServer.ssl=false'
fi
echo "Keycloak: addresses and email set."
EOF

compose up -d --wait --remove-orphans
docker image prune -f >/dev/null
echo "Demo up: https://demo.$(sed -n 's/^DOMAIN=//p' "$ENV_FILE")"
