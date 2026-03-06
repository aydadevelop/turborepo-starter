import { randomUUID } from "node:crypto";
import { db } from "@my-app/db";
import { contaktlyWorkspaceConfig } from "@my-app/db/schema/contaktly";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

import { type DemoWidgetConfig, resolveDemoWidget } from "./contaktly-demo";

export interface ContaktlyWidgetAdminConfig extends DemoWidgetConfig {
	configId: string;
}

const BOOKING_URL_PROTOCOLS = new Set(["http:", "https:"]);

const normalizeBookingUrl = (value: string) => {
	const trimmed = value.trim();

	if (!trimmed) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Booking URL is required.",
		});
	}

	try {
		const parsed = new URL(trimmed);
		if (!BOOKING_URL_PROTOCOLS.has(parsed.protocol)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Booking URL must use http or https.",
			});
		}
		return parsed.toString();
	} catch (error) {
		if (error instanceof ORPCError) {
			throw error;
		}

		throw new ORPCError("BAD_REQUEST", {
			message: "Booking URL must be a valid absolute URL.",
		});
	}
};

const getConfigOverride = async (configId: string) => {
	const [stored] = await db
		.select()
		.from(contaktlyWorkspaceConfig)
		.where(eq(contaktlyWorkspaceConfig.publicConfigId, configId))
		.limit(1);

	return stored ?? null;
};

export const resolveContaktlyWorkspaceOrganizationId = async (
	configId: string
) => {
	const override = await getConfigOverride(configId);
	return override?.organizationId ?? null;
};

export const ensureContaktlyWorkspaceOwnership = async ({
	configId,
	organizationId,
}: {
	configId: string;
	organizationId: string;
}) => {
	const existing = await getConfigOverride(configId);

	if (existing) {
		if (existing.organizationId !== organizationId) {
			throw new ORPCError("FORBIDDEN", {
				message:
					"This Contaktly widget config belongs to a different organization.",
			});
		}

		return existing;
	}

	await db
		.insert(contaktlyWorkspaceConfig)
		.values({
			id: randomUUID(),
			publicConfigId: configId,
			organizationId,
		})
		.onConflictDoNothing();

	const created = await getConfigOverride(configId);

	if (!created) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message:
				"Failed to claim the Contaktly widget config for this organization.",
		});
	}

	if (created.organizationId !== organizationId) {
		throw new ORPCError("FORBIDDEN", {
			message:
				"This Contaktly widget config belongs to a different organization.",
		});
	}

	return created;
};

const mergeWithSeedConfig = ({
	configId,
	override,
}: {
	configId: string;
	override: Awaited<ReturnType<typeof getConfigOverride>>;
}): ContaktlyWidgetAdminConfig => {
	const fallback = resolveDemoWidget(configId);

	return {
		configId,
		allowedDomains: override?.allowedDomains ?? fallback.allowedDomains,
		bookingUrl: override?.bookingUrl ?? fallback.bookingUrl,
		botName: override?.botName ?? fallback.botName,
		openingMessage: override?.openingMessage ?? fallback.openingMessage,
		starterCards: override?.starterCards ?? fallback.starterCards,
		theme: override?.theme ?? fallback.theme,
	};
};

export const getContaktlyWidgetAdminConfig = async (
	configId: string,
	organizationId?: string
): Promise<ContaktlyWidgetAdminConfig> => {
	if (organizationId) {
		await ensureContaktlyWorkspaceOwnership({ configId, organizationId });
	}

	const override = await getConfigOverride(configId);
	return mergeWithSeedConfig({ configId, override });
};

export const resolveContaktlyWidgetConfig = async (
	configId: string
): Promise<DemoWidgetConfig> => {
	const config = await getContaktlyWidgetAdminConfig(configId);

	return {
		allowedDomains: [...config.allowedDomains],
		bookingUrl: config.bookingUrl,
		botName: config.botName,
		openingMessage: config.openingMessage,
		starterCards: [...config.starterCards],
		theme: config.theme,
	};
};

export const saveContaktlyWidgetAdminConfig = async ({
	bookingUrl,
	configId,
	organizationId,
}: {
	bookingUrl: string;
	configId: string;
	organizationId: string;
}): Promise<ContaktlyWidgetAdminConfig> => {
	const normalizedBookingUrl = normalizeBookingUrl(bookingUrl);
	await ensureContaktlyWorkspaceOwnership({ configId, organizationId });

	await db
		.insert(contaktlyWorkspaceConfig)
		.values({
			id: randomUUID(),
			publicConfigId: configId,
			organizationId,
			bookingUrl: normalizedBookingUrl,
		})
		.onConflictDoUpdate({
			target: contaktlyWorkspaceConfig.publicConfigId,
			set: {
				bookingUrl: normalizedBookingUrl,
				updatedAt: new Date(),
			},
		});

	return getContaktlyWidgetAdminConfig(configId);
};
