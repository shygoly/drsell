-- AlterTable
ALTER TABLE "Shop" ADD COLUMN "refreshToken" TEXT;
ALTER TABLE "Shop" ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP(3);
