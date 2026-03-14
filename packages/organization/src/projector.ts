import { db as defaultDb } from "@my-app/db";
import type { DomainEventType } from "@my-app/events";
import { registerEventPusher } from "@my-app/events";

import { recalculateOrganizationOnboarding } from "./service";
import {
	type Db,
	type OrganizationOverlayEventType,
	organizationOverlayEventTypes,
} from "./types";

const organizationOverlayEventTypeSet = new Set<DomainEventType>(
	organizationOverlayEventTypes,
);

const isOrganizationOverlayEventType = (
	type: DomainEventType,
): type is OrganizationOverlayEventType =>
	organizationOverlayEventTypeSet.has(type);

export const registerOrganizationOverlayProjector = (
	db: Db = defaultDb,
): void => {
	registerEventPusher(async (event) => {
		if (!isOrganizationOverlayEventType(event.type)) {
			return;
		}

		await recalculateOrganizationOnboarding(event.organizationId, db);
	});
};
