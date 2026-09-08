import { Body, Controller, Post, Res } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import type { Response } from 'express';
import { Auth } from '../common/auth.decorators';
import { AdpService } from './adp.service';

class ChatDto {
  @IsString()
  shopDomain!: string;

  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsString()
  visitorId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}

@Controller('adp')
export class AdpController {
  constructor(private readonly adp: AdpService) {}

  @Auth()
  @Post('chat')
  async chat(@Body() body: ChatDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      await this.adp.proxyChatSse({
        shopDomain: body.shopDomain,
        visitorId: body.visitorId || 'merchant',
        text: body.text,
        conversationId: body.conversationId,
        onChunk: (chunk) => res.write(chunk),
      });
      // 计数由 proxyChatSse 内部完成。这里原先又补了一次 bumpChatStat，
      // 让商家侧的试聊在同一条对话上重复计数。
      res.end();
    } catch (e) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: String(e) })}\n\n`);
      res.end();
    }
  }
}
