export function isBillingError(err: unknown): boolean {
  if (err == null) return false;
  const rec = err as {
    status?: number;
    message?: string;
    cause?: { status?: number; message?: string };
  };
  const status = rec.status ?? rec.cause?.status;
  if (status === 402) return true;
  const msg = [rec.message, rec.cause?.message, err instanceof Error ? err.message : String(err)]
    .filter(Boolean)
    .join(' ');
  return /billing|insufficient\s*balance|余额不足|payment required|\b402\b/i.test(msg);
}
