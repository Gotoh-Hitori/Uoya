#!/usr/bin/env bash
# Smoke check the actual HTTPS entry and HTTP-to-HTTPS redirect.
set -euo pipefail
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 chat.example.com" >&2
  exit 2
fi
host="$1"
echo '[1] Checking HTTP redirection'
curl -sSI --max-time 15 "http://${host}/" | sed -n '1,12p'
echo '[2] Checking HTTPS health endpoint'
curl --fail-with-body -sS --max-time 20 "https://${host}/social-api/api/health"
echo
echo '[3] Check SSE after signing in: Browser DevTools -> Network -> /social-api/api/events'
echo '    Expected Content-Type: text/event-stream with periodic heartbeat frames.'
echo '[4] Check public port scan externally: only 80, 443, 7000; NEVER 8080/3001/8787.'
