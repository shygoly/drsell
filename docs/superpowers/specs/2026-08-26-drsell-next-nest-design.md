# Drsell Next+Nest Platform Design

Date: 2026-08-26

## Decisions

- Full platform rewrite: Auth, Tenant, Shopify, ADP, Subscription, Mail, Admin
- pnpm + Turborepo monorepo
- AI: Tencent Cloud ADP (not Coze)
- Partner app: Drsell `264501002241` (Delisted → republish)
- Domain: `drsell.szchada.top` single-host path routing
- Postgres public: `wjclawpg.szchada.com:443` via Nginx stream SNI; 65432 closed

## Public Postgres

- Host: `wjclawpg.szchada.com`
- Port: `443`
- DB: `drsell`
- User: `drsell_app`
- Password: stored in `infra/docker/postgres/init.sql` and ops secret manager
- Cloudflare: DNS-only

## Architecture

See implementation under `apps/`, `packages/`, `infra/`.
