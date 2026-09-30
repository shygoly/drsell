import { isBillingError } from './billing';

describe('isBillingError', () => {
  it('402', () => {
    expect(isBillingError({ status: 402, message: 'Payment Required' })).toBe(true);
    expect(isBillingError(Object.assign(new Error('no'), { status: 402 }))).toBe(true);
  });

  it('billing 文案', () => {
    expect(isBillingError(new Error('decision=fallback_model reason=billing'))).toBe(true);
    expect(isBillingError(new Error('Insufficient Balance'))).toBe(true);
    expect(isBillingError(new Error('余额不足'))).toBe(true);
  });

  it('非欠费', () => {
    expect(isBillingError(new Error('timeout'))).toBe(false);
    expect(isBillingError({ status: 500, message: 'upstream' })).toBe(false);
    expect(isBillingError(null)).toBe(false);
  });
});
