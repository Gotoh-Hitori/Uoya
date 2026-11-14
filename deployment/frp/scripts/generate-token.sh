#!/usr/bin/env bash
# Run once; securely copy the generated token into each host's secrets/token.
set -euo pipefail
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/token" >&2
  exit 2
fi
umask 077
out="$1"
if [[ -e "$out" ]]; then
  echo "Refusing to overwrite existing token: $out" >&2
  exit 1
fi
mkdir -p "$(dirname "$out")"
if command -v openssl >/dev/null 2>&1; then
  openssl rand -hex 32 > "$out"
else
  echo "openssl is required to generate a secure token" >&2
  exit 1
fi
chmod 600 "$out"
echo "Token generated at: $out (permissions 600). Do not commit or paste it publicly."
