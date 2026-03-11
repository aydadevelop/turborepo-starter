CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "booking"
	ADD CONSTRAINT "booking_exclude_active_listing_overlap"
	EXCLUDE USING gist (
		"listing_id" WITH =,
		tstzrange("starts_at", "ends_at", '[)') WITH &&
	)
	WHERE ("status" <> 'cancelled'::"booking_status");--> statement-breakpoint
ALTER TABLE "listing_availability_block"
	ADD CONSTRAINT "listing_availability_block_exclude_active_overlap"
	EXCLUDE USING gist (
		"listing_id" WITH =,
		tstzrange("starts_at", "ends_at", '[)') WITH &&
	)
	WHERE ("is_active" = true);
