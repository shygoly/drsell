# Pichat Shopify app — identity and publish notes

当前生产身份：**Pichat**，client_id `fb28d7cc61d6e9c16f47eb28114087ae`，handle `pichat`，App ID **429852852225**，Partner 组织苏州畅达（Dev Dashboard `131655032`）。

已下架、禁止再用于生产：

- Drsell App ID **264501002241**，client_id `0b36b70772220b71b2fe296b3deba914`，handle `drseller-alpha`
- legacy jade app `client_id=f286a4af8f1d80cb8e6228bc648f4786`

## Steps

1. Dev Dashboard → Pichat → API credentials
   - Copy **Client ID** / **Secret** into:
     - `apps/web/.env` → `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`
     - `apps/api/.env` → same
     - `apps/storefront/.env` → `NEXT_PUBLIC_SHOPIFY_API_KEY`（= Client ID）
     - `apps/web/shopify.app.toml` → `client_id`
2. App setup URLs（随 `shopify app deploy --path apps/web` 覆盖到 Partner）:
   - App URL: `https://drsell.szchada.top`
   - Allowed redirection: `https://drsell.szchada.top/api/auth/callback`
   - Webhooks: `https://drsell.szchada.top/api/webhooks`
3. Deploy stack to wjclaw; verify DNS + TLS
4. Install on a **new** development store (old Drsell installs do not transfer); smoke test OAuth, embed, webhooks, storefront chat
5. Dev Dashboard → API access → **Protected customer data**：申请 Name/Email/Phone/Address 及使用原因。批准后把 `orders/*` 与 GDPR `compliance_topics` 加回 `shopify.app.toml` 再 `shopify app deploy --path apps/web`
6. Distribution → listing（`listing/LISTING.md`）→ **Submit for review**

`shopify app deploy` **必须** `--path apps/web`。
