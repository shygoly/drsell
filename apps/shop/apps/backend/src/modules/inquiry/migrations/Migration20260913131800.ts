import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260913131800 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "inquiry" add column if not exists "draftOrderId" text null, add column if not exists "quotedAmount" integer null, add column if not exists "quotedCurrency" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "inquiry" drop column if exists "draftOrderId", drop column if exists "quotedAmount", drop column if exists "quotedCurrency";`);
  }

}
