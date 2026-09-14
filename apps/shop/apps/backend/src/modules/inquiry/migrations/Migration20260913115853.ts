import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260913115853 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "inquiry" ("id" text not null, "contactRole" text not null, "inquiryType" text not null, "companyName" text null, "contactName" text not null, "contactEmail" text null, "contactPhone" text null, "region" text null, "productsOfInterest" text null, "applicationScene" text null, "expectedVolume" text null, "purchaseTimeline" text null, "message" text null, "status" text not null default 'new', "source" text not null default 'web_form', "conversationId" text null, "internalNote" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "inquiry_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_inquiry_deleted_at" ON "inquiry" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "inquiry" cascade;`);
  }

}
