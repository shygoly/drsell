import {
  sealInstallUserToken,
  unsealInstallUserToken,
} from './oauth-state';

const SECRET = 'test-secret';

describe('oauth-state', () => {
  it('签名 state 能取回原始 user token', () => {
    const sealed = sealInstallUserToken('jwt-token-abc', SECRET);
    expect(unsealInstallUserToken(sealed, SECRET)).toBe('jwt-token-abc');
  });

  it('被篡改的密封串解析失败', () => {
    const sealed = sealInstallUserToken('jwt-token-abc', SECRET);
    const flip = sealed[3] === 'A' ? 'B' : 'A';
    const tampered = `${sealed.slice(0, 3)}${flip}${sealed.slice(4)}`;
    expect(unsealInstallUserToken(tampered, SECRET)).toBeNull();
  });

  it('过期密封串解析失败', () => {
    const now = 1_700_000_000_000;
    const sealed = sealInstallUserToken('jwt-token-abc', SECRET, now);
    expect(
      unsealInstallUserToken(sealed, SECRET, now + 11 * 60 * 1000),
    ).toBeNull();
  });

  it('密钥不同解析失败', () => {
    const sealed = sealInstallUserToken('jwt-token-abc', SECRET);
    expect(unsealInstallUserToken(sealed, 'other-secret')).toBeNull();
  });
});
