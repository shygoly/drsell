import {
  ACCESS_TOKEN_REFRESH_SKEW_MS,
  ShopAccessTokenService,
} from './shop-access-token.service';

describe('ShopAccessTokenService helpers', () => {
  const svc = Object.create(ShopAccessTokenService.prototype) as ShopAccessTokenService;

  it('treats missing accessTokenExpiresAt as legacy non-expiring', () => {
    expect(
      svc.isLegacyNonExpiring({
        accessToken: 'v1:enc',
        accessTokenExpiresAt: null,
      }),
    ).toBe(true);
    expect(
      svc.isLegacyNonExpiring({
        accessToken: 'v1:enc',
        accessTokenExpiresAt: new Date('2099-01-01'),
      }),
    ).toBe(false);
  });

  it('needs refresh when within skew window', () => {
    const now = new Date('2026-09-07T12:00:00.000Z');
    expect(
      svc.needsRefresh(
        {
          accessTokenExpiresAt: new Date(
            now.getTime() + ACCESS_TOKEN_REFRESH_SKEW_MS - 1000,
          ),
        },
        now,
      ),
    ).toBe(true);
    expect(
      svc.needsRefresh(
        {
          accessTokenExpiresAt: new Date(
            now.getTime() + ACCESS_TOKEN_REFRESH_SKEW_MS + 60_000,
          ),
        },
        now,
      ),
    ).toBe(false);
    expect(svc.needsRefresh({ accessTokenExpiresAt: null }, now)).toBe(false);
  });
});
