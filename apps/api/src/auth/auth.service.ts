import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async validateAdmin(email: string, password: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.signAdmin(user);
  }

  async registerAdmin(email: string, password: string) {
    const normalized = email.toLowerCase().trim();
    const existing = await this.prisma.adminUser.findUnique({
      where: { email: normalized },
    });
    if (existing) throw new ConflictException('Account already exists');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.adminUser.create({
      data: { email: normalized, passwordHash, role: 'admin' },
    });
    return this.signAdmin(user);
  }

  async exchangeGoogle(params: { email: string }) {
    const email = params.email.toLowerCase().trim();
    let user = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!user) {
      // Google-created accounts have no usable password.
      const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
      user = await this.prisma.adminUser.create({
        data: { email, passwordHash, role: 'owner' },
      });
    }
    return this.signAdmin(user);
  }

  private signAdmin(user: {
    id: string;
    email: string;
    tenantId?: string | null;
    role: string;
  }) {
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
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const existing = await this.prisma.adminUser.findUnique({ where: { email } });
    if (existing) return existing;
    // 密钥不硬编码兜底（AGENTS.md 陷阱 6）：未配置时跳过播种，只留警告。
    if (!password) {
      this.logger.warn('BOOTSTRAP_ADMIN_PASSWORD 未配置，跳过超管播种');
      return null;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    return this.prisma.adminUser.create({
      data: { email, passwordHash, role: 'superadmin' },
    });
  }
}
