/** 运营台展示的套餐目录（镜像 billing env，供 ops UI 与用量上限） */
export type OpsPlanDef = {
  code: string;
  displayName: string;
  priceUsd: number;
  chatLimit: number;
  aiResolvedLimit: number;
  seatLimit: number;
  aiOverageUsd: number;
  trialDays: number;
};

const DEFAULT: OpsPlanDef = {
  code: process.env.BILLING_PLAN_CODE || 'pro',
  displayName: process.env.OPS_PLAN_DISPLAY_NAME || 'Growth',
  priceUsd: Number(process.env.BILLING_PLAN_PRICE || process.env.OPS_PLAN_PRICE_USD || 79),
  chatLimit: Number(process.env.OPS_PLAN_CHAT_LIMIT || 3000),
  aiResolvedLimit: Number(process.env.OPS_PLAN_AI_LIMIT || 1000),
  seatLimit: Number(process.env.OPS_PLAN_SEAT_LIMIT || 5),
  aiOverageUsd: Number(process.env.OPS_PLAN_AI_OVERAGE_USD || 0.9),
  trialDays: Number(process.env.OPS_PLAN_TRIAL_DAYS || 14),
};

const CATALOG: Record<string, OpsPlanDef> = {
  [DEFAULT.code]: DEFAULT,
  free: {
    code: 'free',
    displayName: 'Free',
    priceUsd: 0,
    chatLimit: 500,
    aiResolvedLimit: 200,
    seatLimit: 1,
    aiOverageUsd: 0,
    trialDays: 14,
  },
  pro: DEFAULT.code === 'pro' ? DEFAULT : { ...DEFAULT, code: 'pro', displayName: 'Pro' },
};

export function resolveOpsPlan(planCode: string | null | undefined): OpsPlanDef {
  if (!planCode) return DEFAULT;
  return CATALOG[planCode] ?? { ...DEFAULT, code: planCode, displayName: planCode };
}

export function listOpsPlans(): OpsPlanDef[] {
  const seen = new Set<string>();
  return Object.values(CATALOG).filter((p) => {
    if (seen.has(p.code)) return false;
    seen.add(p.code);
    return true;
  });
}
