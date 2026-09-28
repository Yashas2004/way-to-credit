CREATE TYPE "public"."issue_entry_kind" AS ENUM('message', 'resolved', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('awaiting_admin', 'awaiting_user', 'resolved');--> statement-breakpoint
CREATE TABLE "issue_admin_reads" (
	"issue_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"last_read_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "issue_admin_reads_issue_id_admin_id_pk" PRIMARY KEY("issue_id","admin_id")
);
--> statement-breakpoint
CREATE TABLE "issue_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"issue_id" uuid NOT NULL,
	"kind" "issue_entry_kind" DEFAULT 'message' NOT NULL,
	"author_type" "actor_type" NOT NULL,
	"author_user_id" uuid,
	"author_admin_id" uuid,
	"body" text NOT NULL,
	"sent_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_messages_author_xor_check" CHECK (("issue_messages"."author_user_id" IS NOT NULL) <> ("issue_messages"."author_admin_id" IS NOT NULL)),
	CONSTRAINT "issue_messages_author_type_check" CHECK (("issue_messages"."author_type" = 'user') = ("issue_messages"."author_user_id" IS NOT NULL)),
	CONSTRAINT "issue_messages_body_check" CHECK (("issue_messages"."kind" = 'message') = (length("issue_messages"."body") > 0))
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raised_by" uuid NOT NULL,
	"subject" text NOT NULL,
	"status" "issue_status" DEFAULT 'awaiting_admin' NOT NULL,
	"opened_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_user_message_at" timestamp (3) with time zone,
	"last_admin_message_at" timestamp (3) with time zone,
	"user_last_read_at" timestamp (3) with time zone,
	"resolved_at" timestamp (3) with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
ALTER TABLE "issue_admin_reads" ADD CONSTRAINT "issue_admin_reads_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_admin_reads" ADD CONSTRAINT "issue_admin_reads_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_messages" ADD CONSTRAINT "issue_messages_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_messages" ADD CONSTRAINT "issue_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_messages" ADD CONSTRAINT "issue_messages_author_admin_id_admins_id_fk" FOREIGN KEY ("author_admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_resolved_by_admins_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_messages_issue_sent_idx" ON "issue_messages" USING btree ("issue_id","sent_at","id");--> statement-breakpoint
CREATE INDEX "issues_raised_by_activity_idx" ON "issues" USING btree ("raised_by","last_activity_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "issues_status_activity_idx" ON "issues" USING btree ("status","last_activity_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "issues_activity_idx" ON "issues" USING btree ("last_activity_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "issues_resolved_by_idx" ON "issues" USING btree ("resolved_by");