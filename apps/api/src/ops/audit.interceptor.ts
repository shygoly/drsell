import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import type { JwtPayload } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_ACTION_KEY } from './audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string>(AUDIT_ACTION_KEY, context.getHandler());
    if (!action) return next.handle();

    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtPayload | undefined;
    const shopDomain =
      req.params?.domain ?? req.params?.shopDomain ?? req.body?.shopDomain ?? null;
    const ip = req.ip ?? req.headers['x-forwarded-for'] ?? null;

    const pending = this.prisma.auditLog.create({
      data: {
        actorId: user?.sub ?? 'unknown',
        actorEmail: user?.email ?? 'unknown',
        action,
        shopDomain: shopDomain ?? undefined,
        result: 'pending',
        ip: typeof ip === 'string' ? ip : null,
        payload: { body: req.body ?? null },
      },
    });

    return from(pending).pipe(
      switchMap((log) =>
        next.handle().pipe(
          switchMap(async (result) => {
            await this.prisma.auditLog.update({
              where: { id: log.id },
              data: { result: 'ok', payload: { body: req.body ?? null, result } },
            });
            return result;
          }),
          catchError((err) =>
            from(
              this.prisma.auditLog.update({
                where: { id: log.id },
                data: {
                  result: 'failed',
                  payload: { body: req.body ?? null, error: String(err?.message ?? err) },
                },
              }),
            ).pipe(switchMap(() => throwError(() => err))),
          ),
        ),
      ),
    );
  }
}
