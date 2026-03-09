import type { db } from "@my-app/db";
import type {
	listing,
	listingPublication,
} from "@my-app/db/schema/marketplace";

export type Db = typeof db;

export type ListingRow = typeof listing.$inferSelect;
export type ListingPublicationRow = typeof listingPublication.$inferSelect;

export interface CreateListingInput {
	organizationId: string;
	listingTypeSlug: string;
	name: string;
	slug: string;
	description?: string;
	metadata?: Record<string, unknown>;
	timezone?: string;
}

export interface UpdateListingInput {
	id: string;
	organizationId: string;
	name?: string;
	description?: string;
	metadata?: Record<string, unknown>;
	timezone?: string;
}

export interface ListListingsInput {
	organizationId: string;
	limit?: number;
	offset?: number;
}

export interface PublishListingInput {
	listingId: string;
	organizationId: string;
	channelType?: "own_site" | "platform_marketplace";
}
