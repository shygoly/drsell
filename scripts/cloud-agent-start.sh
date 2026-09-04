#!/usr/bin/env bash
# Cloud Agent start: per-boot reconciliation of daemons the apps depend on.
# Idempotent — tolerates an already-running service and then returns.
set -euo pipefail

# PostgreSQL (dev DB for apps/api).
sudo pg_ctlcluster 16 main start 2>/dev/null || true

# Redis (declared dependency; started for completeness).
sudo mkdir -p /var/run/redis
redis-cli ping >/dev/null 2>&1 || sudo redis-server /etc/redis/redis.conf --daemonize yes

# Wait for PostgreSQL to accept connections before the app terminals start.
for _ in $(seq 1 30); do
  pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && break
  sleep 1
done

echo "cloud-agent-start: postgres=$(pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && echo up || echo down) redis=$(redis-cli ping 2>/dev/null || echo down)"
