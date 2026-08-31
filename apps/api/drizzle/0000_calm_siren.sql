CREATE TYPE "public"."activity_event" AS ENUM('login', 'logout', 'forced_logout');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."query_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"event" "activity_event" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"mobile_number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_admin_id_unique" UNIQUE("admin_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_loan_types" (
	"bank_id" uuid NOT NULL,
	"loan_type_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_loan_types_bank_id_loan_type_id_pk" PRIMARY KEY("bank_id","loan_type_id")
);
--> statement-breakpoint
CREATE TABLE "banks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"query_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "descriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bank_id" uuid NOT NULL,
	"loan_type_id" uuid NOT NULL,
	"status_id" uuid NOT NULL,
	"body" text DEFAULT 'NA' NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"level_number" integer NOT NULL,
	"points_required" integer NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_level_number_unique" UNIQUE("level_number"),
	CONSTRAINT "milestones_points_required_unique" UNIQUE("points_required")
);
--> statement-breakpoint
CREATE TABLE "queries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raised_by" uuid NOT NULL,
	"bank_id" uuid NOT NULL,
	"loan_type_id" uuid NOT NULL,
	"status_id" uuid NOT NULL,
	"bank_name_snapshot" text NOT NULL,
	"loan_type_name_snapshot" text NOT NULL,
	"status_name_snapshot" text NOT NULL,
	"message" text NOT NULL,
	"status" "query_status" DEFAULT 'pending' NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"admin_id" uuid,
	"refresh_token_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "sessions_actor_xor_check" CHECK (("sessions"."user_id" IS NOT NULL) <> ("sessions"."admin_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "statuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_milestones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"credit_points" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "bank_loan_types" ADD CONSTRAINT "bank_loan_types_bank_id_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."banks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_loan_types" ADD CONSTRAINT "bank_loan_types_loan_type_id_loan_types_id_fk" FOREIGN KEY ("loan_type_id") REFERENCES "public"."loan_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_query_id_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."queries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "descriptions" ADD CONSTRAINT "descriptions_bank_id_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."banks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "descriptions" ADD CONSTRAINT "descriptions_loan_type_id_loan_types_id_fk" FOREIGN KEY ("loan_type_id") REFERENCES "public"."loan_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "descriptions" ADD CONSTRAINT "descriptions_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "descriptions" ADD CONSTRAINT "descriptions_updated_by_admins_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_bank_id_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."banks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_loan_type_id_loan_types_id_fk" FOREIGN KEY ("loan_type_id") REFERENCES "public"."loan_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_resolved_by_admins_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_milestones" ADD CONSTRAINT "user_milestones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_milestones" ADD CONSTRAINT "user_milestones_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_actor_id_occurred_at_idx" ON "activity_log" USING btree ("actor_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_entity_type_entity_id_occurred_at_idx" ON "audit_log" USING btree ("entity_type","entity_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bank_loan_types_loan_type_id_idx" ON "bank_loan_types" USING btree ("loan_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "banks_name_active_unique" ON "banks" USING btree ("name") WHERE "banks"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "credit_transactions_user_id_idx" ON "credit_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_transactions_query_id_idx" ON "credit_transactions" USING btree ("query_id");--> statement-breakpoint
CREATE UNIQUE INDEX "descriptions_bank_loan_status_unique" ON "descriptions" USING btree ("bank_id","loan_type_id","status_id");--> statement-breakpoint
CREATE INDEX "descriptions_loan_type_id_idx" ON "descriptions" USING btree ("loan_type_id");--> statement-breakpoint
CREATE INDEX "descriptions_status_id_idx" ON "descriptions" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "descriptions_updated_by_idx" ON "descriptions" USING btree ("updated_by");--> statement-breakpoint
CREATE UNIQUE INDEX "loan_types_name_active_unique" ON "loan_types" USING btree ("name") WHERE "loan_types"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "queries_raised_by_idx" ON "queries" USING btree ("raised_by");--> statement-breakpoint
CREATE INDEX "queries_bank_id_idx" ON "queries" USING btree ("bank_id");--> statement-breakpoint
CREATE INDEX "queries_loan_type_id_idx" ON "queries" USING btree ("loan_type_id");--> statement-breakpoint
CREATE INDEX "queries_status_id_idx" ON "queries" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "queries_resolved_by_idx" ON "queries" USING btree ("resolved_by");--> statement-breakpoint
CREATE INDEX "queries_status_raised_at_idx" ON "queries" USING btree ("status","raised_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "queries_raised_by_raised_at_idx" ON "queries" USING btree ("raised_by","raised_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_admin_id_idx" ON "sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_token_hash_unique" ON "sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "statuses_name_active_unique" ON "statuses" USING btree ("name") WHERE "statuses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_milestones_user_milestone_unique" ON "user_milestones" USING btree ("user_id","milestone_id");--> statement-breakpoint
CREATE INDEX "user_milestones_milestone_id_idx" ON "user_milestones" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "users_created_by_idx" ON "users" USING btree ("created_by");