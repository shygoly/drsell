import { createParamDecorator, ExecutionContext, Injectable, SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.user;
});

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

export function Auth() {
  return applyDecorators(UseGuards(JwtAuthGuard));
}
