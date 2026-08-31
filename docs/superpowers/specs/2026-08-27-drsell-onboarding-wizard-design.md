# Drsell Onboarding Wizard — Design Spec

> **实现状态（2026-08-31）**：本规格已在 storefront 应用落地为 4 步向导
> （/onboarding：Welcome → Sync → Widget → Done），设计令牌沿用当前项目
> Stitch→shadcn 体系（primary #006c49 / accent-deep #0a3d2e / chart-2 等），
> 而非原计划的 Polaris。首次进入守卫（OnboardingGuard）会在
> `onboardingStep !== 'done'` 时把店铺跳转到 /onboarding；Step 3 通过
> App Bridge `shopify.app.extensions()` 自动探测 embed 激活，并支持
> 「Enable in theme」深链与手动确认。已部署 drsell.szchada.top 并线上验证。

**Date:** 2026-08-27  
**Status:** Approved  
**Reference:** Taylor Sicard Shopify App onboarding benchmark (≤5 steps, activation by step 3–4)

## Summary

First-install onboarding wizard for Drsell embedded Shopify app. **Activation = Theme App Embed Live (Widget on storefront).** MVP ships Steps 1–3 plus lightweight Step 5; knowledge-base setup (original Step 4) moves to Settings post-activation.

## Locked decisions

| Topic | Decision |
|-------|----------|
| Activation metric | Theme App Embed enabled → Widget **Live** (Step 3) |
| ADP | Single platform AppKey (`ADP_DEFAULT_APP_KEY`); merchants not configured. Isolation via `tenant_id` + visitor identity in ADP |
| i18n | **D:** App UI follows Shopify admin locale; Widget follows browser language (phased) |
| MVP scope | Steps 1–3 + light Step 5; Step 4 deferred to Settings |

## Goals

- Reach **Widget Live** within 3 wizard steps for typical merchants
- Establish trust on Step 1 (data permission transparency)
- Start catalog sync without blocking configuration (async Step 2)
- Built for Shopify–friendly embed activation via App Bridge deep link + `app.extensions()` status
- Bilingual admin UI from MVP; widget language detection in P0, full multilingual content in P1

## Non-goals (MVP)

- In-wizard knowledge base setup (Step 4)
- Merchant ADP AppKey configuration UI
- Team members, social channels, AI persona (post-onboarding Settings only)
- Full widget i18n content editor (P1)

## User flow

```mermaid
flowchart LR
  Install[OAuth install] --> S1[Step 1 Welcome + permissions]
  S1 -->|Skip defaults| S3
  S1 --> S2[Step 2 Data sync choices]
  S2 --> S3[Step 3 Widget + enable embed]
  S3 -->|Embed Live| ACTIVATED[Activated]
  ACTIVATED --> S5[Step 5 Complete]
  S5 --> Home[/app home]
  Home --> Settings[Settings advanced incl. KB]
```

### Step 1 — Welcome + permissions

**Purpose:** Trust + consent framing before data access.

**Content:**
- Product value (AI support on storefront)
- Icons + short copy for requested scopes: products, orders, customers — **why** each is used
- Primary CTA: **Start setup**
- Secondary: **Continue with defaults** → jump to Step 3 (skip Step 2)

**UX:** No walls of text. Polaris `Card` + icons. Optional link to privacy/data use doc.

**Required for activation?** No (skippable).

### Step 2 — Data sync selection

**Purpose:** Let merchant choose what syncs to Drsell DB + ADP knowledge (by `tenant_id`).

**Toggles (all default ON):**
| Data | Use |
|------|-----|
| Products | AI product Q&A, recommendations |
| Orders | Shipping, returns lookup |
| Customers | Profile + conversation context |

**Behavior:**
- On continue: enqueue async sync jobs per enabled kind
- Show per-kind progress (spinner + counts); **do not block** advancing to Step 3
- Poll `GET /shopify/sync/status` every 3–5s while wizard open

**Required for activation?** No.

### Step 3 — Widget config + enable (activation point)

**Purpose:** Configure minimal widget appearance and enable Theme App Embed.

**Config fields (saved to `BotSetting`):**
- Primary color (default brand-friendly)
- Position: bottom-right / bottom-left
- Welcome message (single string MVP; bilingual JSON field reserved for P1)

**Actions:**
1. Save widget prefs via `PATCH /shopify/onboarding`
2. **Enable widget** → App Bridge deep link to theme editor App Embed:
   ```
   shopify://admin/themes/current/editor?context=apps&activateAppId={client_id}/chat-embed
   ```
3. Poll `shopify.app.extensions()` until `drsell-chat` or `chat-embed` activation = live
4. On live: set `embedLiveAt`, mark activated, proceed to Step 5

**Homepage banner (persistent):** Live (green) / Not deployed (orange) + deep link CTA.

**Required for activation?** **Yes** — cannot complete onboarding without embed live.

### Step 4 — Knowledge base (deferred)

Moved to **Settings → AI knowledge base** after activation:
- Auto-fetch policy/FAQ/shipping pages
- Manual Q&A, ecommerce templates, document upload
- Can run on generic ecommerce + product data until configured

### Step 5 — Complete (lightweight)

**Content:**
- Success state + confirmation Widget is live
- Link: **View storefront** (preview)
- Three next steps: test chat, view conversations (Inbox placeholder OK), optional Settings links
- Optional checklist card linking advanced Settings (KB, templates, persona) — not blocking

**Required for activation?** No (shown after activation; dismiss → `/app`).

## Architecture

### Recommended approach: dedicated wizard route

- Route: `/app/onboarding`
- Guard: `/app` redirects to onboarding if `onboardingStep !== 'done'` AND `embedLiveAt` is null (unless user explicitly dismissed Step 5 only)
- Stack: Next.js embedded app + Polaris + App Bridge React (already in `apps/web`)

**Rejected alternatives:**
- Modal-only on home — poor return-from-theme-editor state recovery
- Dashboard-only deep links — insufficient progress UX

### Frontend structure

```
apps/web/app/app/onboarding/page.tsx
apps/web/app/app/onboarding/steps/WelcomeStep.tsx
apps/web/app/app/onboarding/steps/SyncStep.tsx
apps/web/app/app/onboarding/steps/WidgetStep.tsx
apps/web/app/app/onboarding/steps/CompleteStep.tsx
apps/web/lib/onboarding.ts          # deep link builder, step guards
apps/web/lib/i18n/zh-CN.json
apps/web/lib/i18n/en.json
apps/web/components/EmbedStatusBanner.tsx
```

### Backend

Extend `BotSetting` (or add `ShopOnboarding` 1:1 with Shop):

```prisma
model BotSetting {
  // existing fields ...
  onboardingStep           String   @default("1")  // "1"|"2"|"3"|"5"|"done"
  onboardingCompletedAt    DateTime?
  embedLiveAt              DateTime?
  widgetPrimaryColor       String?  @default("#008060")
  widgetPosition           String?  @default("bottom-right")
  welcomeMessage           String?
  welcomeMessageI18n       Json?    // P1: { "zh-CN": "...", "en": "..." }
  syncProductsEnabled      Boolean  @default(true)
  syncOrdersEnabled        Boolean  @default(true)
  syncCustomersEnabled     Boolean  @default(true)
}
```

Remove merchant-facing `adpAppKey` from Settings UI; API uses `process.env.ADP_DEFAULT_APP_KEY` only. Optional: keep DB column unused or drop in migration later.

**API endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/shopify/onboarding` | step, sync progress, embed hint, widget prefs |
| PATCH | `/shopify/onboarding` | update step, widget prefs, mark done |
| POST | `/shopify/sync/batch` | start sync for enabled kinds (reuse `syncCatalog`) |
| GET | `/shopify/sync/status` | aggregate `KnowledgeSyncJob` + counts |

Auth: existing shop session JWT from embedded app (replace dev manual shop login over time).

### ADP integration

- All ADP calls: platform AppKey + **`tenantId`** from `Shop.tenantId`
- Storefront chat: pass shop domain + generated visitor id in ADP session metadata
- Knowledge sync jobs tag documents with `tenant_id` for ADP upsert

### Embed status detection

1. **Client:** `useAppBridge()` → `shopify.app.extensions()` — check `drsell-chat` (extension) or `chat-embed` (block) activation on published theme
2. **Deep link:** `activateAppId={SHOPIFY_API_KEY}/chat-embed` (Liquid block filename, not extension name)
3. **Server mirror (optional P1):** Admin GraphQL `themeAppExtensions` for analytics

### Internationalization

**App (MVP):**
- Polaris `AppProvider` `i18n` prop
- Locale from Shopify embedded session / `shopify.config.locale` (fallback `zh-CN`, support `en`)
- All wizard strings in JSON catalogs; no hardcoded UI copy in components

**Widget (phased):**

| Phase | Scope |
|-------|--------|
| P0 | `navigator.language` → `zh*` = Chinese chrome strings, else English; single welcome message from merchant config |
| P1 | `welcomeMessageI18n`, FAQ templates, ADP `visitorLang` param |

Manual language override in Settings (P1).

## Settings changes (post-design)

- **Remove:** ADP AppKey input
- **Add sections:** AI knowledge base (ex-Step 4), Widget advanced styling
- **Keep:** chat logo, shop display name, sync manual triggers

## Error handling

| Case | Behavior |
|------|----------|
| Sync job fails | Show warning on Step 2/5; do not block activation |
| Embed not enabled after deep link | Stay on Step 3 with retry + help link |
| `app.extensions()` unavailable | Fallback copy: manual enable instructions + screenshot |
| OAuth missing scopes | Step 1 explains; link to re-auth |

## Testing plan

- Fresh install → wizard shows Step 1
- Skip defaults → lands Step 3
- Step 2 sync runs async; progress updates while on Step 3
- Deep link opens theme editor; mock/live embed → Step 5
- `embedLiveAt` set → `/app` shows Live banner
- Locale `en` admin → English wizard strings
- Settings has no ADP key field

## Success metrics

- **Primary:** % installs with `embedLiveAt` within 24h
- **Secondary:** median time install → `embedLiveAt`
- **Guardrail:** wizard abandonment rate per step

## Implementation order (high level)

1. Prisma migration + onboarding API
2. Polaris shell + i18n scaffolding
3. Wizard Steps 1–3 + deep link + embed polling
4. Step 5 + `/app` guard + EmbedStatusBanner
5. Settings cleanup (remove ADP key, add KB placeholder)
6. Widget P0 locale detection in `drsell-chat.js`

## References

- Extension: `apps/web/extensions/chatbot/` (`drsell-chat`, handle in deploy UID)
- Client ID: `shopify.app.toml` → `0b36b70772220b71b2fe296b3deba914`
- Existing sync: `POST /shopify/sync/:kind` in `shopify.controller.ts`
- MVP scope doc: `docs/MVP_SCOPE.md`
