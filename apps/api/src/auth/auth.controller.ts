import { Body, Controller, OnModuleInit, Post } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class AdminLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
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
}
