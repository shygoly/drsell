# Drsell Shopify republish checklist

App ID: **264501002241** (Drsell) — currently Delisted under 苏州畅达 Partner.

## Steps

1. Partner Dashboard → Apps → Drsell → API credentials  
   - Copy **Client ID** / **Secret** into:
     - `apps/web/.env` → `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`
     - `apps/api/.env` → same
     - `apps/web/shopify.app.toml` → `client_id`
2. App setup URLs:
   - App URL: `https://drsell.szchada.top`
   - Allowed redirection: `https://drsell.szchada.top/api/auth/callback`
   - Preferential webhooks: `https://drsell.szchada.top/api/webhooks`
3. Deploy stack to wjclaw; verify DNS + TLS
4. Install on development store; smoke test OAuth, embed, webhooks, storefront chat
5. Distribution → update listing (privacy policy, screenshots, test account) → **Submit for review**

## Do not use

Legacy jade app `client_id=f286a4af8f1d80cb8e6228bc648f4786` for production.
