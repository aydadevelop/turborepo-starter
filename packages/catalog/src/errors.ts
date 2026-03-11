import { DrizzleQueryError } from "drizzle-orm/errors";

export const CATALOG_ERROR_CODES = {
	listingSlugConflict: "LISTING_SLUG_CONFLICT",
	listingTypeInactive: "LISTING_TYPE_INACTIVE",
	listingTypeNotEnabled: "LISTING_TYPE_NOT_ENABLED",
	listingTypeNotFound: "LISTING_TYPE_NOT_FOUND",
	notFound: "NOT_FOUND",
} as const;

export type CatalogErrorCode =
	(typeof CATALOG_ERROR_CODES)[keyof typeof CATALOG_ERROR_CODES];

export class CatalogError extends Error {
	readonly code: CatalogErrorCode;

	constructor(code: CatalogErrorCode, message = code) {
		super(message);
		this.code = code;
		this.name = "CatalogError";
	}
}

export const isCatalogErrorCode = (
	error: unknown,
	code: CatalogErrorCode
): boolean =>
	(error instanceof CatalogError && error.code === code) ||
	(error instanceof Error && error.message === code);

interface PgConstraintErrorLike {
	code?: string;
	constraint?: string;
}

const getConstraintError = (error: unknown): PgConstraintErrorLike | null => {
	if (error instanceof DrizzleQueryError) {
		const cause = error.cause;
		if (cause && typeof cause === "object") {
			return cause as PgConstraintErrorLike;
		}
	}

	if (error && typeof error === "object") {
		return error as PgConstraintErrorLike;
	}

	return null;
};

export const rethrowCatalogPersistenceError = (error: unknown): never => {
	const constraintError = getConstraintError(error);

	if (
		constraintError?.code === "23505" &&
		constraintError.constraint === "listing_uq_org_slug"
	) {
		throw new CatalogError(CATALOG_ERROR_CODES.listingSlugConflict);
	}

	if (
		constraintError?.code === "23503" &&
		constraintError.constraint ===
			"listing_listing_type_slug_listing_type_config_slug_fkey"
	) {
		throw new CatalogError(CATALOG_ERROR_CODES.listingTypeNotFound);
	}

	throw error;
};
