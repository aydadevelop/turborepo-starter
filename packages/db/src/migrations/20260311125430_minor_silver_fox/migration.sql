CREATE TYPE "storage_access" AS ENUM('public', 'private');--> statement-breakpoint
ALTER TABLE "listing_asset" ADD COLUMN "storage_provider" text DEFAULT 'listing-public-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_asset" ADD COLUMN "access" "storage_access" DEFAULT 'public'::"storage_access" NOT NULL;--> statement-breakpoint
CREATE INDEX "listing_asset_ix_storage_provider" ON "listing_asset" ("storage_provider");