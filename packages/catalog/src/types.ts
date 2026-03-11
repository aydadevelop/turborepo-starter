import type { db } from "@my-app/db";
import type {
	listing,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";

export type Db = typeof db;

export type ListingInsert = typeof listing.$inferInsert;
export type ListingRow = typeof listing.$inferSelect;
export type ListingPublicationRow = typeof listingPublication.$inferSelect;
export type ListingTypeRow = typeof listingTypeConfig.$inferSelect;

export interface ListingTypeOption {
	icon?: string | null;
	isDefault: boolean;
	label: string;
	metadataJsonSchema: Record<string, unknown>;
	value: string;
}

export interface ListingTypeOptionsResult {
	defaultValue: string | null;
	items: ListingTypeOption[];
}

export interface CreateListingInput {
	description?: string;
	listingTypeSlug: string;
	metadata?: Record<string, unknown>;
	name: string;
	organizationId: string;
	slug: string;
	timezone?: string;
}

export interface UpdateListingInput {
	description?: string;
	id: string;
	metadata?: Record<string, unknown>;
	name?: string;
	organizationId: string;
	timezone?: string;
}

export interface ListListingsInput {
	limit?: number;
	offset?: number;
	organizationId: string;
}

export interface PublishListingInput {
	channelType?: "own_site" | "platform_marketplace";
	listingId: string;
	organizationId: string;
}
