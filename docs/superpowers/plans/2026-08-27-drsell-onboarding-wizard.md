# Drsell Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 4-step first-install onboarding wizard (Steps 1–3 + 5) that activates merchants when Theme App Embed `drsell-chat` is Live.

**Architecture:** Dedicated `/app/onboarding` route with Polaris stepper; NestJS onboarding endpoints extend `BotSetting`; App Bridge deep link + `app.extensions()` polling for embed status; platform ADP key only.

**Tech Stack:** Next.js 15, Polaris 13, App Bridge React 4, NestJS, Prisma/PostgreSQL, existing `drsell-chat` theme extension.

**Spec:** `docs/superpowers/specs/2026-08-27-drsell-onboarding-wizard-design.md`

## Global Constraints

- Activation metric = Theme App Embed Live (`embedLiveAt` set); Step 3 cannot be skipped
- ADP = single platform key `ADP_DEFAULT_APP_KEY`; no merchant ADP AppKey UI
- App i18n follows Shopify admin locale (`zh-CN` / `en`); widget browser lang P0 in `drsell-chat.js`
- MVP excludes in-wizard knowledge base (Step 4 → Settings later)
- Extension handle: `drsell-chat`; client_id: `0b36b70772220b71b2fe296b3deba914`
- Do not block wizard on sync completion; async jobs with progress polling only

---

### Task 1: Prisma schema + onboarding API

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/shopify/shopify.service.ts`
- Modify: `apps/api/src/shopify/shopify.controller.ts`
- Create: `apps/api/src/shopify/dto/onboarding.dto.ts`

**Interfaces:**
- Consumes: existing `getOrCreateBotSetting`, `syncCatalog`, `KnowledgeSyncJob` model
- Produces:
  - `GET /shopify/onboarding?shop=` → `OnboardingState`
  - `PATCH /shopify/onboarding?shop=` → `OnboardingState`
  - `POST /shopify/sync/batch?shop=` → `{ started: string[] }`
  - `GET /shopify/sync/status?shop=` → `SyncStatus`

```typescript
// packages/shared/src/index.ts additions
export type OnboardingStep = '1' | '2' | '3' | '5' | 'done';

export type OnboardingState = {
  step: OnboardingStep;
  embedLiveAt: string | null;
  onboardingCompletedAt: string | null;
  widgetPrimaryColor: string;
  widgetPosition: 'bottom-right' | 'bottom-left';
  welcomeMessage: string | null;
  syncProductsEnabled: boolean;
  syncOrdersEnabled: boolean;
  syncCustomersEnabled: boolean;
  activated: boolean;
};

export type SyncStatus = {
  products: { status: string; count?: number };
  orders: { status: string; count?: number };
  customers: { status: string; count?: number };
};
```

- [ ] **Step 1: Add BotSetting fields in schema.prisma**

```prisma
  onboardingStep        String    @default("1")
  onboardingCompletedAt DateTime?
  embedLiveAt           DateTime?
  widgetPrimaryColor    String?   @default("#008060")
  widgetPosition        String?   @default("bottom-right")
  welcomeMessage        String?
  welcomeMessageI18n    Json?
  syncProductsEnabled   Boolean   @default(true)
  syncOrdersEnabled     Boolean   @default(true)
  syncCustomersEnabled  Boolean   @default(true)
```

- [ ] **Step 2: Run migration**

Run: `cd apps/api && npx prisma migrate dev --name onboarding_wizard_fields`
Expected: migration SQL applied, client regenerated

- [ ] **Step 3: Add DTO + controller routes**

`onboarding.dto.ts`:
```typescript
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class PatchOnboardingDto {
  @IsOptional() @IsIn(['1', '2', '3', '5', 'done']) step?: string;
  @IsOptional() @IsString() widgetPrimaryColor?: string;
  @IsOptional() @IsIn(['bottom-right', 'bottom-left']) widgetPosition?: string;
  @IsOptional() @IsString() welcomeMessage?: string;
  @IsOptional() @IsBoolean() syncProductsEnabled?: boolean;
  @IsOptional() @IsBoolean() syncOrdersEnabled?: boolean;
  @IsOptional() @IsBoolean() syncCustomersEnabled?: boolean;
  @IsOptional() markEmbedLive?: boolean;
  @IsOptional() @IsBoolean() complete?: boolean;
}
```

Controller additions (`@Auth()` on all):
```typescript
@Get('onboarding')
getOnboarding(@Query('shop') shop: string) {
  return this.shopify.getOnboardingState(shop);
}

@Patch('onboarding')
patchOnboarding(@Query('shop') shop: string, @Body() body: PatchOnboardingDto) {
  return this.shopify.patchOnboardingState(shop, body);
}

@Post('sync/batch')
batchSync(@Query('shop') shop: string) {
  return this.shopify.startBatchSync(shop);
}

@Get('sync/status')
syncStatus(@Query('shop') shop: string) {
  return this.shopify.getSyncStatus(shop);
}
```

- [ ] **Step 4: Implement service methods**

`getOnboardingState`: load bot setting, return `OnboardingState` with `activated: !!embedLiveAt`

`patchOnboardingState`:
- merge widget/sync fields
- if `markEmbedLive`: set `embedLiveAt = now()`, `step = '5'`
- if `complete`: set `onboardingCompletedAt = now()`, `step = 'done'`

`startBatchSync`: read enabled flags, call existing `syncCatalog(shop, kind)` per enabled kind (fire-and-forget Promise.all, catch/log errors)

`getSyncStatus`: latest `KnowledgeSyncJob` per kind for shop + product/order/customer counts from DB

- [ ] **Step 5: Stop accepting adpAppKey in updateBotSetting**

Remove from `BotSettingDto` and ignore in `updateBotSetting`; ADP service reads env only.

- [ ] **Step 6: Manual API smoke test**

Run API locally; `PATCH /shopify/onboarding?shop=test.myshopify.com` with auth token; verify DB columns update.

---

### Task 2: Polaris shell + i18n scaffolding

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/app/layout.tsx`
- Create: `apps/web/lib/i18n/index.ts`
- Create: `apps/web/lib/i18n/zh-CN.json`
- Create: `apps/web/lib/i18n/en.json`
- Create: `apps/web/components/AppProviders.tsx`

**Interfaces:**
- Produces: `AppProviders({ locale, children })`, `useTranslations()` hook returning `(key: string) => string`

- [ ] **Step 1: Add Polaris CSS import in root layout**

```tsx
import '@shopify/polaris/build/esm/styles.css';
```

- [ ] **Step 2: Create translation files**

Minimum keys for wizard:
- `onboarding.step1.title`, `.subtitle`, `.start`, `.skipDefaults`
- `onboarding.step2.title`, `.products`, `.orders`, `.customers`, `.continue`
- `onboarding.step3.title`, `.color`, `.position`, `.welcome`, `.enable`, `.waiting`
- `onboarding.step5.title`, `.viewStore`, `.next1`, `.next2`, `.next3`, `.goHome`
- `embed.banner.live`, `.embed.banner.notDeployed`, `.embed.banner.enable`

- [ ] **Step 3: AppProviders wrapper**

```tsx
'use client';
import { AppProvider } from '@shopify/polaris';
import zh from '@shopify/polaris/locales/zh-CN.json';
import en from '@shopify/polaris/locales/en.json';
import { createContext, useContext } from 'react';
import catalogs from './i18n';

const I18nCtx = createContext<(k: string) => string>(() => '');

export function AppProviders({ locale, children }: { locale: 'zh-CN' | 'en'; children: React.ReactNode }) {
  const polarisI18n = locale === 'en' ? en : zh;
  const t = (key: string) => catalogs[locale]?.[key] ?? key;
  return (
    <AppProvider i18n={polarisI18n}>
      <I18nCtx.Provider value={t}>{children}</I18nCtx.Provider>
    </AppProvider>
  );
}

export const useTranslations = () => useContext(I18nCtx);
```

- [ ] **Step 4: Wire AppProviders in `app/app/layout.tsx`**

Read locale from query `locale` param or default `zh-CN` (P1: read from Shopify session). Wrap `{children}`.

- [ ] **Step 5: Visual check**

Run `pnpm --filter @drsell/web dev`; `/app` renders with Polaris typography.

---

### Task 3: Onboarding route + Steps 1–2

**Files:**
- Create: `apps/web/app/app/onboarding/page.tsx`
- Create: `apps/web/app/app/onboarding/steps/WelcomeStep.tsx`
- Create: `apps/web/app/app/onboarding/steps/SyncStep.tsx`
- Create: `apps/web/lib/onboarding.ts`

**Interfaces:**
- Consumes: `GET/PATCH /shopify/onboarding`, `POST /shopify/sync/batch`, `GET /shopify/sync/status`
- Produces: `buildEmbedDeepLink(clientId: string): string`

- [ ] **Step 1: onboarding.ts helpers**

```typescript
export const EXTENSION_HANDLE = 'drsell-chat';
export const CLIENT_ID = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!;

export function buildEmbedDeepLink(clientId = CLIENT_ID, handle = EXTENSION_HANDLE) {
  return `shopify://admin/themes/current/editor?context=apps&activateAppId=${clientId}/${handle}`;
}
```

- [ ] **Step 2: WelcomeStep**

Polaris `Card` with 3 permission rows (products/orders/customers icons + `useTranslations` copy).
Buttons: Primary → `onNext('2')`, Secondary → `onSkipToWidget()` calls `PATCH step: '3'`.

- [ ] **Step 3: SyncStep**

Three `Checkbox` tied to sync flags; on Continue:
1. `PATCH` sync enabled flags + `step: '3'`
2. `POST /shopify/sync/batch`
3. navigate to step 3 in parent state

Show inline `ProgressBar` per kind using polled status (start interval in parent).

- [ ] **Step 4: onboarding/page.tsx stepper**

Client component; state `step` from API on mount; `ProgressBar progress={(stepIndex/3)*100}`; render step component.

- [ ] **Step 5: Manual test Steps 1–2**

Load `/app/onboarding`; skip and continue paths update API.

---

### Task 4: Step 3 — Widget config + embed activation

**Files:**
- Create: `apps/web/app/app/onboarding/steps/WidgetStep.tsx`
- Create: `apps/web/hooks/useEmbedStatus.ts`

**Interfaces:**
- Consumes: `useAppBridge()`, `buildEmbedDeepLink`, `PATCH markEmbedLive`
- Produces: `useEmbedStatus(): { live: boolean; loading: boolean; refresh: () => void }`

- [ ] **Step 1: useEmbedStatus hook**

```typescript
'use client';
import { useAppBridge } from '@shopify/app-bridge-react';
import { useCallback, useEffect, useState } from 'react';

export function useEmbedStatus(handle = 'drsell-chat') {
  const shopify = useAppBridge();
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const exts = await shopify.app.extensions();
      const match = exts.find((e: { handle?: string }) => e.handle === handle);
      setLive(Boolean(match?.activated));
    } finally {
      setLoading(false);
    }
  }, [shopify, handle]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { live, loading, refresh };
}
```

(Adjust property names to match actual App Bridge 4 response — log once in dev if shape differs.)

- [ ] **Step 2: WidgetStep UI**

Fields: color text input (MVP), Select position, TextField welcome message.
Primary **Enable widget** → `window.open(buildEmbedDeepLink(), '_top')` or App Bridge navigation API.
Poll `refresh()` every 3s; when `live`, call `PATCH { markEmbedLive: true }`, parent → step 5.

Block Continue until `live === true`.

- [ ] **Step 3: Test on dev store**

Install app; Step 3 deep link opens theme editor; enabling embed advances wizard.

---

### Task 5: Step 5 complete + `/app` guard + banner

**Files:**
- Create: `apps/web/app/app/onboarding/steps/CompleteStep.tsx`
- Create: `apps/web/components/EmbedStatusBanner.tsx`
- Modify: `apps/web/app/app/page.tsx`
- Create: `apps/web/app/app/page.client.tsx` (or inline client guard)

**Interfaces:**
- Consumes: `OnboardingState.activated`, storefront preview URL pattern `https://${shop}`

- [ ] **Step 1: CompleteStep**

Success `Banner`; 3 bullet next steps; button **Go to dashboard** → `PATCH { complete: true }` + router.push(`/app`).

- [ ] **Step 2: EmbedStatusBanner on home**

If `!activated`: warning banner + enable deep link button.
If `activated`: success banner (dismissible).

- [ ] **Step 3: Redirect guard**

On `/app` load: `GET onboarding`; if `step !== 'done' && !embedLiveAt` → `redirect('/app/onboarding')`.
If activated but step is `5` → allow home but show prompt to finish Step 5 once.

- [ ] **Step 4: Replace dev-only home login UX**

Keep sync buttons behind activated state or move to Settings; home shows status + quick links post-onboarding.

---

### Task 6: Settings cleanup + widget locale P0

**Files:**
- Modify: `apps/web/app/app/settings/page.tsx`
- Modify: `apps/web/extensions/chatbot/assets/drsell-chat.js`
- Modify: `apps/api/src/adp/adp.service.ts` (ensure tenant_id on all calls)

- [ ] **Step 1: Remove ADP AppKey from Settings UI**

Remove input + API field; add placeholder section **AI knowledge base** (“Coming soon” + link text).

- [ ] **Step 2: Expose widget config to storefront**

Public endpoint `GET /api/public/widget-config?shop=` returns color, position, welcomeMessage (no secrets).

Update `drsell-chat.js` to fetch config on load.

- [ ] **Step 3: Browser language in widget P0**

```javascript
const lang = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
const UI = {
  zh: { placeholder: '输入问题…', send: '发送' },
  en: { placeholder: 'Ask a question…', send: 'Send' },
}[lang];
```

- [ ] **Step 4: ADP calls include tenantId**

Verify `PublicStorefrontModule` and sync paths pass `shop.tenantId` into ADP client metadata.

---

### Task 7: Deploy + docs update

**Files:**
- Modify: `docs/MVP_SCOPE.md`
- Modify: `docs/DRSELL_PUBLISH.md`

- [ ] **Step 1: Update MVP_SCOPE.md** — add onboarding wizard to P0 table
- [ ] **Step 2: Deploy to wjclaw** via `./scripts/deploy-mvp.sh`
- [ ] **Step 3: Fresh install smoke test** on dev store — full path to Live + Step 5

---

## Plan self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| Activation = embed live | Task 1 `embedLiveAt`, Task 4 polling |
| Step 1 skip to 3 | Task 3 WelcomeStep |
| Step 2 async sync | Task 1 batch + status, Task 3 SyncStep |
| Step 3 deep link | Task 4 WidgetStep |
| Step 5 lightweight | Task 5 CompleteStep |
| Step 4 deferred | Task 6 Settings placeholder |
| No merchant ADP key | Task 1 + Task 6 |
| App i18n D | Task 2 |
| Widget browser lang P0 | Task 6 |
| Home Live banner | Task 5 EmbedStatusBanner |
| Sicard ≤5 steps | 4 wizard screens (1,2,3,5) |

No TBD placeholders remain.

---

## Execution handoff

Plan saved. Choose:

1. **Subagent-Driven** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach do you want?
