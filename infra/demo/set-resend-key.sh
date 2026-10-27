#!/usr/bin/env bash
# Online demo (ADR 0020): Dan pastes the Resend key here, in a terminal, never
# in a chat. The key goes into /opt/astax/demo.env only and is not echoed.
set -euo pipefail

TARGET=/opt/astax/demo.env
[ -e "$TARGET" ] || { echo "Run make-env.sh first."; exit 1; }

printf 'Incolla la chiave di Resend (non si vede mentre la scrivi) e premi Invio: '
IFS= read -rs key
echo
case "$key" in
  re_*) ;;
  *) echo "Non sembra una chiave di Resend (deve iniziare con re_): niente cambiato."; exit 1 ;;
esac

tmp=$(mktemp)
grep -v '^RESEND_API_KEY=' "$TARGET" | sed 's/^EMAIL_PROVIDER=.*/EMAIL_PROVIDER=resend/' >"$tmp"
printf 'RESEND_API_KEY=%s\n' "$key" >>"$tmp"
install -m 600 "$tmp" "$TARGET"
rm -f "$tmp"
unset key
echo "Chiave salvata sul server. Riavvio i servizi che mandano email."
cd /opt/astax/repo
docker compose --env-file "$TARGET" -f infra/demo/compose.yml up -d --force-recreate api worker keycloak
