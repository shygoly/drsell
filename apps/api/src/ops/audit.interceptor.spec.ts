import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AUDIT_ACTION_KEY } from './audit.decorator';

describe('AuditInterceptor', () => {
  it('写操作成功后落一条 AuditLog', async () => {
    const create = jest.fn(async () => ({ id: 'log1' }));
    const update = jest.fn(async () => ({}));
    const prisma = { auditLog: { create, update } } as never;
    const interceptor = new AuditInterceptor(new Reflector(), prisma);
    const handler = () => undefined;
    Reflect.defineMetadata(AUDIT_ACTION_KEY, 'shop.test', handler);
    const context = {
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: 'u1', email: 'ops@test.com' },
          params: { domain: 'a.myshopify.com' },
          body: {},
          ip: '127.0.0.1',
          headers: {},
        }),
      }),
    } as never;

    await interceptor
      .intercept(context, { handle: () => of({ ok: true }) })
      .toPromise();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ result: 'pending' }) }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ result: 'ok' }) }),
    );
  });

  it('写操作抛错时也落一条 AuditLog（结果为 failed）', async () => {
    const create = jest.fn(async () => ({ id: 'log1' }));
    const update = jest.fn(async () => ({}));
    const prisma = { auditLog: { create, update } } as never;
    const interceptor = new AuditInterceptor(new Reflector(), prisma);
    const handler = () => undefined;
    Reflect.defineMetadata(AUDIT_ACTION_KEY, 'shop.test', handler);
    const context = {
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: 'u1', email: 'ops@test.com' },
          params: { domain: 'a.myshopify.com' },
          body: {},
          ip: '127.0.0.1',
          headers: {},
        }),
      }),
    } as never;

    await expect(
      interceptor
        .intercept(context, { handle: () => throwError(() => new Error('boom')) })
        .toPromise(),
    ).rejects.toThrow('boom');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ result: 'failed' }) }),
    );
  });
});
