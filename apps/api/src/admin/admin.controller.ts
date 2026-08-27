import { Controller, Get } from '@nestjs/common';
import { Auth } from '../common/auth.decorators';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Auth()
  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Auth()
  @Get('shops')
  shops() {
    return this.admin.listShops();
  }

  @Auth()
  @Get('users')
  users() {
    return this.admin.listUsers();
  }
}
