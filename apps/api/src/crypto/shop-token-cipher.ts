import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const PREFIX = 'v1:';
const IV_LEN = 12;
const TAG_LEN = 16;

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'drsell-shop-access-token', 32);
}

/** AES-256-GCM 加密 Shopify access token，落库格式 v1:<base64(iv+tag+ciphertext)> */
export function encryptShopAccessToken(plain: string, secret?: string): string {
  const keySecret = secret ?? process.env.SHOP_ACCESS_TOKEN_KEY;
  if (!keySecret) {
    throw new Error('SHOP_ACCESS_TOKEN_KEY 未配置，无法加密 Shop.accessToken');
  }
  const key = deriveKey(keySecret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, enc]);
  return `${PREFIX}${blob.toString('base64')}`;
}

/** 解密；无前缀则视为历史明文，透明兼容 */
export function decryptShopAccessToken(stored: string | null | undefined, secret?: string): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored;

  const keySecret = secret ?? process.env.SHOP_ACCESS_TOKEN_KEY;
  if (!keySecret) {
    throw new Error('SHOP_ACCESS_TOKEN_KEY 未配置，无法解密 Shop.accessToken');
  }
  const key = deriveKey(keySecret);
  const blob = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function isEncryptedShopAccessToken(stored: string | null | undefined): boolean {
  return !!stored?.startsWith(PREFIX);
}
