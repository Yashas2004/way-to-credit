ALTER TABLE "users" ADD COLUMN "archived_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "archived_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_archived_by_admins_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_archived_by_idx" ON "users" USING btree ("archived_by");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_archived_implies_inactive" CHECK ("users"."archived_at" IS NULL OR "users"."is_active" = false);