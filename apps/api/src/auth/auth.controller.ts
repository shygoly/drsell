import {
  Body,
  Controller,
  Headers,
  OnModuleInit,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class AdminLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class AdminRegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class GoogleExchangeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

@Controller('auth')
export class AuthController implements OnModuleInit {
  constructor(private readonly auth: AuthService) {}

  async onModuleInit() {
    await this.auth.ensureBootstrapAdmin();
  }

  @Post('admin/login')
  adminLogin(@Body() body: AdminLoginDto) {
    return this.auth.validateAdmin(body.email, body.password);
  }

  @Post('admin/register')
  adminRegister(@Body() body: AdminRegisterDto) {
    return this.auth.registerAdmin(body.email, body.password);
  }

  @Post('google/exchange')
  googleExchange(
    @Headers('x-internal-key') internalKey: string | undefined,
    @Body() body: GoogleExchangeDto,
  ) {
    const expected = process.env.INTERNAL_API_KEY;
    if (expected && internalKey !== expected) {
      throw new UnauthorizedException('invalid internal key');
    }
    return this.auth.exchangeGoogle({ email: body.email });
  }
}
