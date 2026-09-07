#!/usr/bin/env bash
# Per-boot reconciliation: ensure PostgreSQL + Redis are running.
# Idempotent and safe to run repeatedly. Returns once services are ready.
set -euo pipefail

echo "==> Ensuring PostgreSQL is running"
if command -v pg_ctlcluster >/dev/null 2>&1; then
  # pg_lsclusters prints "online" when the cluster is already up.
  if ! sudo pg_lsclusters 2>/dev/null | grep -q "online"; then
    sudo pg_ctlcluster 16 main start || true
  fi
fi

echo "==> Ensuring Redis is running"
if ! redis-cli ping >/dev/null 2>&1; then
  sudo mkdir -p /var/lib/redis
  sudo redis-server /etc/redis/redis.conf --daemonize yes || true
fi

# Wait for readiness (max ~30s).
for i in $(seq 1 30); do
  pg_ok=0; redis_ok=0
  sudo -u postgres pg_isready -q 2>/dev/null && pg_ok=1 || true
  redis-cli ping >/dev/null 2>&1 && redis_ok=1 || true
  if [ "$pg_ok" = 1 ] && [ "$redis_ok" = 1 ]; then
    echo "==> PostgreSQL + Redis are ready."
    exit 0
  fi
  sleep 1
done

echo "!! Services did not become ready in time" >&2
exit 1
