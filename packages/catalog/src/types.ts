import type { db } from "@my-app/db";
import type {
	listing,
	listingBoatRentProfile,
	listingExcursionProfile,
	listingPublication,
	listingTypeConfig,
	organizationSettings,
} from "@my-app/db/schema/marketplace";

export type Db = typeof db;

export type ListingInsert = typeof listing.$inferInsert;
export type ListingRow = typeof listing.$inferSelect;
export type ListingPublicationRow = typeof listingPublication.$inferSelect;
export type ListingTypeRow = typeof listingTypeConfig.$inferSelect;
export type OrganizationSettingsRow = typeof organizationSettings.$inferSelect;
export type ListingServiceFamily = ListingTypeRow["serviceFamily"];
export type ListingBoatRentProfileRow =
	typeof listingBoatRentProfile.$inferSelect;
export type ListingBoatRentCaptainMode =
	ListingBoatRentProfileRow["captainMode"];
export type ListingBoatRentFuelPolicy = ListingBoatRentProfileRow["fuelPolicy"];
export type ListingExcursionProfileRow =
	typeof listingExcursionProfile.$inferSelect;
export type ListingExcursionGroupFormat =
	ListingExcursionProfileRow["groupFormat"];

export type ListingWorkspaceSection =
	| "basics"
	| "pricing"
	| "availability"
	| "assets"
	| "calendar"
	| "publish";

export interface ListingCustomerPresentationPolicy {
	bookingMode: "request" | "book";
	customerFocus: "asset" | "experience";
	reviewsMode: "standard" | "validated";
}

export interface ListingEditorFieldOption {
	label: string;
	value: string;
}

export interface ListingEditorFieldDefinition {
	helpText?: string;
	key: string;
	kind: "boolean" | "enum" | "integer" | "text";
	label: string;
	options?: ListingEditorFieldOption[];
	required: boolean;
}

export interface ListingServiceFamilyPolicy {
	availabilityMode: "duration" | "schedule";
	customerPresentation: ListingCustomerPresentationPolicy;
	defaults: {
		moderationRequired: boolean;
		requiresLocation: boolean;
	};
	key: ListingServiceFamily;
	label: string;
	operatorSections: ListingWorkspaceSection[];
	profileEditor: {
		description: string;
		fields: ListingEditorFieldDefinition[];
		title: string;
	};
}

export interface ListingTypeOption {
	defaultAmenityKeys: string[];
	icon?: string | null;
	isDefault: boolean;
	label: string;
	metadataJsonSchema: Record<string, unknown>;
	requiredFields: string[];
	serviceFamily: ListingTypeRow["serviceFamily"];
	serviceFamilyPolicy: ListingServiceFamilyPolicy;
	supportedPricingModels: string[];
	value: string;
}

export interface ListingTypeOptionsResult {
	defaultValue: string | null;
	items: ListingTypeOption[];
}

export interface ListingCreateEditorState {
	defaults: {
		timezone: string;
	};
	listingTypes: ListingTypeOptionsResult;
}

export interface ListingPublicationState {
	activePublicationCount: number;
	isPublished: boolean;
	requiresReview: boolean;
}

export interface ListingWorkspaceState {
	boatRentProfile: ListingBoatRentProfileState | null;
	excursionProfile: ListingExcursionProfileState | null;
	listing: ListingRow;
	listingType: ListingTypeOption | null;
	publication: ListingPublicationState;
	serviceFamilyPolicy: ListingServiceFamilyPolicy | null;
}

export interface ListingAssetWorkspaceItem {
	access: "public" | "private";
	altText: string | null;
	id: string;
	isPrimary: boolean;
	kind: "image" | "document" | "other";
	publicUrl: string | null;
	sortOrder: number;
	storageKey: string;
	storageProvider: string;
}

export interface ListingAssetWorkspaceState {
	documentCount: number;
	imageCount: number;
	items: ListingAssetWorkspaceItem[];
	primaryImageId: string | null;
	totalCount: number;
}

export interface CreateListingInput {
	description?: string;
	listingTypeSlug: string;
	metadata?: Record<string, unknown>;
	name: string;
	organizationId: string;
	serviceFamilyDetails?: ListingServiceFamilyInput;
	slug: string;
	timezone?: string;
}

export interface UpdateListingInput {
	description?: string;
	id: string;
	metadata?: Record<string, unknown>;
	name?: string;
	organizationId: string;
	serviceFamilyDetails?: ListingServiceFamilyInput;
	timezone?: string;
}

export interface ListListingsInput {
	filter?: {
		listingTypeSlug?: string;
		serviceFamily?: ListingServiceFamily;
		status?: ListingRow["status"];
	};
	organizationId: string;
	page?: {
		limit: number;
		offset: number;
	};
	search?: string;
	sort?: {
		by: "created_at" | "updated_at" | "name" | "status";
		dir: "asc" | "desc";
	};
}

export interface ListingCollectionResult {
	items: ListingRow[];
	total: number;
}

export interface PublishListingInput {
	channelType?: "own_site" | "platform_marketplace";
	listingId: string;
	organizationId: string;
}

export interface ListingBoatRentProfileInput {
	basePort?: string | null;
	capacity?: number | null;
	captainMode?: ListingBoatRentCaptainMode;
	departureArea?: string | null;
	depositRequired?: boolean;
	fuelPolicy?: ListingBoatRentFuelPolicy;
	instantBookAllowed?: boolean;
}

export interface ListingBoatRentProfileState {
	basePort: string | null;
	capacity: number | null;
	captainMode: ListingBoatRentCaptainMode;
	departureArea: string | null;
	depositRequired: boolean;
	fuelPolicy: ListingBoatRentFuelPolicy;
	instantBookAllowed: boolean;
	listingId: string;
}

export interface ListingServiceFamilyInput {
	boatRent?: ListingBoatRentProfileInput;
	excursion?: ListingExcursionProfileInput;
}

export interface StorefrontBoatRentSummary {
	basePort: string | null;
	capacity: number | null;
	captainMode: ListingBoatRentCaptainMode;
	captainModeLabel: string;
	departureArea: string | null;
	depositRequired: boolean;
	fuelPolicy: ListingBoatRentFuelPolicy;
	fuelPolicyLabel: string;
	instantBookAllowed: boolean;
}

export interface ListingExcursionProfileInput {
	childFriendly?: boolean;
	durationMinutes?: number | null;
	groupFormat?: ListingExcursionGroupFormat;
	instantBookAllowed?: boolean;
	maxGroupSize?: number | null;
	meetingPoint?: string | null;
	primaryLanguage?: string | null;
	ticketsIncluded?: boolean;
}

export interface ListingExcursionProfileState {
	childFriendly: boolean;
	durationMinutes: number | null;
	groupFormat: ListingExcursionGroupFormat;
	instantBookAllowed: boolean;
	listingId: string;
	maxGroupSize: number | null;
	meetingPoint: string | null;
	primaryLanguage: string | null;
	ticketsIncluded: boolean;
}

export interface StorefrontExcursionSummary {
	childFriendly: boolean;
	durationLabel: string | null;
	durationMinutes: number | null;
	groupFormat: ListingExcursionGroupFormat;
	groupFormatLabel: string;
	instantBookAllowed: boolean;
	maxGroupSize: number | null;
	meetingPoint: string | null;
	primaryLanguage: string | null;
	ticketsIncluded: boolean;
}
