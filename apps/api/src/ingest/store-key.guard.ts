import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

/**
 * 服务端到服务端鉴权：摄取端点只认 `x-store-key` == INGEST_STORE_KEY。
 * 这不是商家 JWT——独立站（Medusa 连接器）用它推数据。未配置密钥则一律拒绝（fail closed）。
 */
@Injectable()
export class StoreKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const provided = req.headers['x-store-key'];
    const expected = process.env.INGEST_STORE_KEY;
    if (!expected || typeof provided !== 'string' || !safeEqual(provided, expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
