#!/usr/bin/env bash
# Online demo (ADR 0020): Dan pastes the Resend key here, in a terminal, never
# in a chat. The key goes into /opt/astax/demo.env only and is not echoed.
set -euo pipefail

TARGET=/opt/astax/demo.env
[ -e "$TARGET" ] || { echo "Run make-env.sh first."; exit 1; }

echo "Incolla la chiave di Resend UNA volta sola (non si vede mentre la incolli) e premi Invio."
printf 'Chiave: '
IFS= read -rs key
echo
# Spaces and line ends around a paste are dropped; the key itself is checked
# for its shape: re_ and about 30-60 letters, digits or _ (never shown).
key=$(printf '%s' "$key" | tr -d '[:space:]')
count=$(grep -o 're_' <<<"$key" | wc -l)
if [ "$count" -gt 1 ]; then
  echo "Hai incollato la chiave $count volte (${#key} caratteri): niente cambiato. Riprova incollando una volta sola."
  exit 1
fi
if ! [[ "$key" =~ ^re_[A-Za-z0-9_]{20,80}$ ]]; then
  echo "Non sembra una chiave di Resend (${#key} caratteri; deve iniziare con re_): niente cambiato."
  exit 1
fi

tmp=$(mktemp)
grep -v '^RESEND_API_KEY=' "$TARGET" | sed 's/^EMAIL_PROVIDER=.*/EMAIL_PROVIDER=resend/' >"$tmp"
printf 'RESEND_API_KEY=%s\n' "$key" >>"$tmp"
install -m 600 "$tmp" "$TARGET"
rm -f "$tmp"
echo "Chiave salvata sul server (${#key} caratteri). Riavvio i servizi che mandano email."
unset key
cd /opt/astax/repo
docker compose --env-file "$TARGET" -f infra/demo/compose.yml up -d --force-recreate api worker keycloak
# Keycloak sends the login codes: its SMTP takes the key too (as in deploy.sh).
commit=$(git rev-parse HEAD)
"$(dirname "$0")/deploy.sh" "$commit" "$(sed -n 's/^IMAGE_TAG=//p' "$TARGET")" >/dev/null
echo "Fatto: da ora le email della demo partono con Resend."
