#!/usr/bin/env bash
# Optional: migrate selected tables from legacy Java PG/MySQL dumps into Drsell Prisma schema.
# Usage: LEGACY_DATABASE_URL=... DATABASE_URL=... pnpm exec ts-node scripts/migrate-legacy.ts
set -euo pipefail
echo "Legacy migration scaffold."
echo "Map shops -> Shop/Tenant, bot settings -> BotSetting, inbox -> InboxUser."
echo "Implement dump-specific transforms once source dump is available."
