#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/infra/docker/certs"
mkdir -p "$CERT_DIR"

if [[ ! -f "$CERT_DIR/server.key" ]]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.crt" \
    -subj "/CN=wjclawpg.szchada.com" \
    -addext "subjectAltName=DNS:wjclawpg.szchada.com,DNS:drsell.szchada.top,IP:163.7.7.160"
fi

# Web TLS: prefer real Origin CA; fallback self-signed for bootstrap
if [[ ! -f "$CERT_DIR/privkey.pem" ]]; then
  cp "$CERT_DIR/server.key" "$CERT_DIR/privkey.pem"
  cp "$CERT_DIR/server.crt" "$CERT_DIR/fullchain.pem"
fi

chmod 600 "$CERT_DIR"/*.key "$CERT_DIR"/privkey.pem || true
echo "Certs ready in $CERT_DIR"
