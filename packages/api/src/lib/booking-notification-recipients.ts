import { db } from "@full-stack-cf-app/db";
import { member } from "@full-stack-cf-app/db/schema/auth";
import { eq } from "drizzle-orm";

import { hasOrganizationPermission } from "../organization";

const uniqueUserIds = (values: Array<string | null | undefined>): string[] =>
	values.filter((value, index, array): value is string => {
		return Boolean(value) && array.indexOf(value) === index;
	});

export const resolveOrganizationBookingManagerUserIds = async (
	organizationId: string
) => {
	const memberships = await db
		.select({
			userId: member.userId,
			role: member.role,
		})
		.from(member)
		.where(eq(member.organizationId, organizationId));

	return uniqueUserIds(
		memberships
			.filter((membership) =>
				hasOrganizationPermission(membership.role, {
					booking: ["update"],
				})
			)
			.map((membership) => membership.userId)
	);
};

export const resolveBookingNotificationUserIds = async (params: {
	organizationId: string;
	userIds: Array<string | null | undefined>;
	includeBookingManagers?: boolean;
}) => {
	const baseUserIds = uniqueUserIds(params.userIds);
	if (!params.includeBookingManagers) {
		return baseUserIds;
	}

	const managerUserIds = await resolveOrganizationBookingManagerUserIds(
		params.organizationId
	);
	return uniqueUserIds([...baseUserIds, ...managerUserIds]);
};
