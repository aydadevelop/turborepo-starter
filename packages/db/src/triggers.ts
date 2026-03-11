const UPDATED_AT_TRIGGER_TABLES = [
	"organization_onboarding",
	"listing",
	"listing_asset",
	"listing_pricing_profile",
	"organization_listing_type",
	"organization_payment_config",
	"listing_publication",
	"listing_availability_rule",
	"listing_availability_exception",
	"listing_availability_block",
	"listing_minimum_duration_rule",
	"listing_calendar_connection",
] as const;

export const POST_MIGRATION_TRIGGER_STATEMENTS = [
	`CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.updated_at = now();
	RETURN NEW;
END;
$$;`,
	...UPDATED_AT_TRIGGER_TABLES.flatMap((tableName) => [
		`DROP TRIGGER IF EXISTS set_updated_at_${tableName} ON "${tableName}";`,
		`CREATE TRIGGER set_updated_at_${tableName}
BEFORE UPDATE ON "${tableName}"
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();`,
	]),
] as const;

/**
 * Post-migration trigger SQL that mirrors the committed migration chain for
 * schema-push test databases.
 */
export const POST_MIGRATION_TRIGGERS_SQL =
	POST_MIGRATION_TRIGGER_STATEMENTS.join("\n");
