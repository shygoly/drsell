import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { Auth } from '../common/auth.decorators';
import { MailService } from './mail.service';

class MailDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  shopDomain?: string;
}

@Controller('mail')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Auth()
  @Get('subscribers')
  list() {
    return this.mail.list();
  }

  @Auth()
  @Post('subscribers')
  upsert(@Body() body: MailDto) {
    return this.mail.upsert(body.email, body.shopDomain);
  }

  @Auth()
  @Post('unsubscribe')
  unsub(@Body() body: MailDto) {
    return this.mail.unsubscribe(body.email);
  }
}
