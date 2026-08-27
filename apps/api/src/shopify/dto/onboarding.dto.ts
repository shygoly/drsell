import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class PatchOnboardingDto {
  @IsOptional()
  @IsIn(['1', '2', '3', '5', 'done'])
  step?: string;

  @IsOptional()
  @IsString()
  widgetPrimaryColor?: string;

  @IsOptional()
  @IsIn(['bottom-right', 'bottom-left'])
  widgetPosition?: string;

  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @IsOptional()
  @IsBoolean()
  syncProductsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  syncOrdersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  syncCustomersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  markEmbedLive?: boolean;

  @IsOptional()
  @IsBoolean()
  complete?: boolean;
}
