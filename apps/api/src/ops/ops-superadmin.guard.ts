import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/auth.service';

@Injectable()
export class OpsSuperadminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtPayload | undefined;
    if (user?.typ === 'admin' && user.role === 'superadmin') return true;
    throw new ForbiddenException('superadmin required');
  }
}
