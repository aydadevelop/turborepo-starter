CREATE TABLE "organization_onboarding" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"payment_configured" boolean DEFAULT false NOT NULL,
	"calendar_connected" boolean DEFAULT false NOT NULL,
	"listing_published" boolean DEFAULT false NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"last_recalculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
WITH organization_payment_state AS (
	SELECT
		opc.organization_id,
		true AS payment_configured,
		max(coalesce(opc.validated_at, opc.updated_at, opc.created_at)) AS payment_ready_at
	FROM "organization_payment_config" opc
	WHERE opc.is_active = true
		AND opc.validation_status = 'validated'
	GROUP BY opc.organization_id
),
organization_calendar_state AS (
	SELECT
		lcc.organization_id,
		true AS calendar_connected,
		max(coalesce(lcc.updated_at, lcc.created_at)) AS calendar_ready_at
	FROM "listing_calendar_connection" lcc
	WHERE lcc.is_active = true
		AND lcc.external_calendar_id IS NOT NULL
	GROUP BY lcc.organization_id
),
organization_publication_state AS (
	SELECT
		lp.organization_id,
		true AS listing_published,
		max(coalesce(lp.updated_at, lp.created_at)) AS listing_ready_at
	FROM "listing_publication" lp
	WHERE lp.is_active = true
	GROUP BY lp.organization_id
),
organization_state AS (
	SELECT
		o.id AS organization_id,
		coalesce(ops.payment_configured, false) AS payment_configured,
		coalesce(ocs.calendar_connected, false) AS calendar_connected,
		coalesce(ops2.listing_published, false) AS listing_published,
		ops.payment_ready_at,
		ocs.calendar_ready_at,
		ops2.listing_ready_at
	FROM "organization" o
	LEFT JOIN organization_payment_state ops
		ON ops.organization_id = o.id
	LEFT JOIN organization_calendar_state ocs
		ON ocs.organization_id = o.id
	LEFT JOIN organization_publication_state ops2
		ON ops2.organization_id = o.id
)
INSERT INTO "organization_onboarding" (
	"id",
	"organization_id",
	"payment_configured",
	"calendar_connected",
	"listing_published",
	"is_complete",
	"completed_at",
	"last_recalculated_at",
	"created_at",
	"updated_at"
)
SELECT
	'organization-onboarding:' || organization_id,
	organization_id,
	payment_configured,
	calendar_connected,
	listing_published,
	payment_configured AND calendar_connected AND listing_published,
	CASE
		WHEN payment_configured AND calendar_connected AND listing_published THEN greatest(
			payment_ready_at,
			calendar_ready_at,
			listing_ready_at
		)
		ELSE NULL
	END,
	now(),
	now(),
	now()
FROM organization_state
WHERE payment_configured OR calendar_connected OR listing_published;--> statement-breakpoint
ALTER TABLE "listing_availability_exception" ALTER COLUMN "date" SET DATA TYPE date USING ("date" AT TIME ZONE 'UTC')::date;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_calendar_connection_uq_primary_listing" ON "listing_calendar_connection" ("listing_id") WHERE "is_primary" = true and "is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_asset_uq_primary_image" ON "listing_asset" ("listing_id") WHERE "is_primary" = true and "kind" = 'image';--> statement-breakpoint
CREATE UNIQUE INDEX "listing_pricing_profile_uq_default" ON "listing_pricing_profile" ("listing_id") WHERE "is_default" = true and "archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_listing_type_uq_default" ON "organization_listing_type" ("organization_id") WHERE "is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_onboarding_uq_organization_id" ON "organization_onboarding" ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_onboarding_ix_is_complete" ON "organization_onboarding" ("is_complete");--> statement-breakpoint
ALTER TABLE "organization_onboarding" ADD CONSTRAINT "organization_onboarding_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listing_availability_block" ADD CONSTRAINT "listing_availability_block_ck_window" CHECK ("ends_at" > "starts_at");--> statement-breakpoint
ALTER TABLE "listing_availability_exception" ADD CONSTRAINT "listing_availability_exception_ck_minutes" CHECK ((
				("start_minute" is null and "end_minute" is null)
				or (
					"start_minute" is not null
					and "end_minute" is not null
					and "start_minute" >= 0
					and "start_minute" < 1440
					and "end_minute" > "start_minute"
					and "end_minute" <= 1440
				)
			));--> statement-breakpoint
ALTER TABLE "listing_availability_rule" ADD CONSTRAINT "listing_availability_rule_ck_day_of_week" CHECK ("day_of_week" between 0 and 6);--> statement-breakpoint
ALTER TABLE "listing_availability_rule" ADD CONSTRAINT "listing_availability_rule_ck_minute_range" CHECK ("start_minute" >= 0 and "start_minute" < 1440 and "end_minute" > "start_minute" and "end_minute" <= 1440);--> statement-breakpoint
ALTER TABLE "listing_minimum_duration_rule" ADD CONSTRAINT "listing_minimum_duration_rule_ck_time_bounds" CHECK ("start_hour" between 0 and 23 and "end_hour" between 0 and 23 and "start_minute" between 0 and 59 and "end_minute" between 0 and 59);--> statement-breakpoint
ALTER TABLE "listing_minimum_duration_rule" ADD CONSTRAINT "listing_minimum_duration_rule_ck_positive_duration" CHECK ("minimum_duration_minutes" > 0 and (("end_hour" * 60) + "end_minute") > (("start_hour" * 60) + "start_minute"));--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_ck_minimums" CHECK ("minimum_duration_minutes" > 0 and "minimum_notice_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_ck_working_hours" CHECK ("working_hours_start" between 0 and 23 and "working_hours_end" between 1 and 24 and "working_hours_end" > "working_hours_start");--> statement-breakpoint
ALTER TABLE "listing_pricing_profile" ADD CONSTRAINT "listing_pricing_profile_ck_positive_amounts" CHECK ("base_hourly_price_cents" > 0 and "minimum_hours" > 0);--> statement-breakpoint
ALTER TABLE "listing_pricing_profile" ADD CONSTRAINT "listing_pricing_profile_ck_bps_range" CHECK ("deposit_bps" between 0 and 10000
				and "service_fee_bps" between 0 and 10000
				and "affiliate_fee_bps" between 0 and 10000
				and "tax_bps" between 0 and 10000
				and "acquiring_fee_bps" between 0 and 10000);--> statement-breakpoint
ALTER TABLE "listing_pricing_profile" ADD CONSTRAINT "listing_pricing_profile_ck_valid_window" CHECK ("valid_from" is null or "valid_to" is null or "valid_to" > "valid_from");--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.updated_at = now();
	RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_organization_onboarding ON "organization_onboarding";--> statement-breakpoint
CREATE TRIGGER set_updated_at_organization_onboarding BEFORE UPDATE ON "organization_onboarding" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_listing ON "listing";--> statement-breakpoint
CREATE TRIGGER set_updated_at_listing BEFORE UPDATE ON "listing" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_listing_asset ON "listing_asset";--> statement-breakpoint
CREATE TRIGGER set_updated_at_listing_asset BEFORE UPDATE ON "listing_asset" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_listing_pricing_profile ON "listing_pricing_profile";--> statement-breakpoint
CREATE TRIGGER set_updated_at_listing_pricing_profile BEFORE UPDATE ON "listing_pricing_profile" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_organization_listing_type ON "organization_listing_type";--> statement-breakpoint
CREATE TRIGGER set_updated_at_organization_listing_type BEFORE UPDATE ON "organization_listing_type" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_organization_payment_config ON "organization_payment_config";--> statement-breakpoint
CREATE TRIGGER set_updated_at_organization_payment_config BEFORE UPDATE ON "organization_payment_config" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_listing_publication ON "listing_publication";--> statement-breakpoint
CREATE TRIGGER set_updated_at_listing_publication BEFORE UPDATE ON "listing_publication" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_listing_availability_rule ON "listing_availability_rule";--> statement-breakpoint
CREATE TRIGGER set_updated_at_listing_availability_rule BEFORE UPDATE ON "listing_availability_rule" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_listing_availability_exception ON "listing_availability_exception";--> statement-breakpoint
CREATE TRIGGER set_updated_at_listing_availability_exception BEFORE UPDATE ON "listing_availability_exception" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_listing_availability_block ON "listing_availability_block";--> statement-breakpoint
CREATE TRIGGER set_updated_at_listing_availability_block BEFORE UPDATE ON "listing_availability_block" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_listing_minimum_duration_rule ON "listing_minimum_duration_rule";--> statement-breakpoint
CREATE TRIGGER set_updated_at_listing_minimum_duration_rule BEFORE UPDATE ON "listing_minimum_duration_rule" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at_listing_calendar_connection ON "listing_calendar_connection";--> statement-breakpoint
CREATE TRIGGER set_updated_at_listing_calendar_connection BEFORE UPDATE ON "listing_calendar_connection" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
