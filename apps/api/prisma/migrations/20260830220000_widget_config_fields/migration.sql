-- AlterTable
ALTER TABLE "BotSetting" ADD COLUMN "widgetHeaderColor" TEXT DEFAULT '#008060',
ADD COLUMN "widgetWindowSize" TEXT DEFAULT 'medium',
ADD COLUMN "widgetLauncherStyle" TEXT DEFAULT 'chat',
ADD COLUMN "widgetVisible" BOOLEAN DEFAULT true,
ADD COLUMN "widgetQuickReplies" JSONB;
