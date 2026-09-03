import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OpsController } from './ops.controller';
import { OpsSuperadminGuard } from './ops-superadmin.guard';
import { AUDIT_ACTION_KEY } from './audit.decorator';

describe('OpsController', () => {
  it('非 superadmin 访问 /api/ops/* 一律 403', () => {
    const guard = new OpsSuperadminGuard();
    expect(() =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({ user: { typ: 'admin', role: 'admin' } }),
        }),
      } as never),
    ).toThrow(ForbiddenException);
  });

  it('superadmin 放行', () => {
    const guard = new OpsSuperadminGuard();
    expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({ user: { typ: 'admin', role: 'superadmin' } }),
        }),
      } as never),
    ).toBe(true);
  });

  it('每个非 @Get handler 都带 @Audit()', () => {
    const reflector = new Reflector();
    const writeMethods = ['dunning', 'extendFreeze', 'billingShop', 'resync', 'impersonate', 'disableWidget', 'enableWidget'];
    for (const name of writeMethods) {
      const desc = Object.getOwnPropertyDescriptor(OpsController.prototype, name);
      expect(desc?.value).toBeDefined();
      const audit = reflector.get(AUDIT_ACTION_KEY, desc!.value);
      expect(audit).toBeTruthy();
    }
  });
});
