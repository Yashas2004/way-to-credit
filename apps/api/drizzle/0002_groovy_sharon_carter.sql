ALTER TABLE "activity_log" ALTER COLUMN "occurred_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "activity_log" ALTER COLUMN "occurred_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "credit_transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "credit_transactions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "queries" ALTER COLUMN "raised_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "queries" ALTER COLUMN "raised_at" SET DEFAULT now();