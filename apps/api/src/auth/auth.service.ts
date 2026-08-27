import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

export type JwtPayload = {
  sub: string;
  email?: string;
  shop?: string;
  tenantId?: string;
  role?: string;
  typ: 'admin' | 'shop';
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async validateAdmin(email: string, password: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.sign({
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId ?? undefined,
      role: user.role,
      typ: 'admin',
    });
  }

  signShopSession(params: { shop: string; tenantId: string; shopRecordId: string }) {
    return this.sign({
      sub: params.shopRecordId,
      shop: params.shop,
      tenantId: params.tenantId,
      typ: 'shop',
    });
  }

  sign(payload: JwtPayload) {
    return {
      accessToken: this.jwt.sign(payload),
      tokenType: 'Bearer',
      expiresIn: 7 * 24 * 3600,
    };
  }

  async ensureBootstrapAdmin() {
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@drsell.szchada.top';
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'ChangeMe_Drsell_Admin_2026!';
    const existing = await this.prisma.adminUser.findUnique({ where: { email } });
    if (existing) return existing;
    const passwordHash = await bcrypt.hash(password, 12);
    return this.prisma.adminUser.create({
      data: { email, passwordHash, role: 'superadmin' },
    });
  }
}
