/**
 * Compatibility wrapper around the new fixture lane:
 * - per-table factories in `fixtures/factories/*`
 * - composed baseline scenario in `fixtures/scenarios/*`
 *
 * Existing tests can keep importing `seedMarketplaceScenario` and
 * `MARKETPLACE_IDS`, while new tests can use the richer scenario result
 * directly from `scenarios/marketplace-baseline`.
 */

import type { TestDatabase } from "../index";
import { seedMarketplaceBaselineScenario } from "./scenarios/marketplace-baseline";

// biome-ignore lint/performance/noBarrelFile: Test fixture compatibility entrypoint re-exports shared marketplace fixture helpers.
export {
	createMarketplaceFixtureClock,
	DEFAULT_MARKETPLACE_ANCHOR_DATE,
	MARKETPLACE_IDS,
	type MarketplaceFixtureClock,
} from "./shared";

export interface MarketplaceFixtureSeedOptions {
	anchorDate?: Date;
}

export const seedMarketplaceScenario = async (
	db: TestDatabase,
	options: MarketplaceFixtureSeedOptions = {}
) => {
	const scenario = await seedMarketplaceBaselineScenario(db, options);
	return scenario.ids;
};
