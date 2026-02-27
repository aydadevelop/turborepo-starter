import { ORPCError } from "@orpc/server";

export const requireActiveMembership = (context: {
	activeMembership: { organizationId: string; role: string } | null;
}) => {
	if (!context.activeMembership) {
		throw new ORPCError("FORBIDDEN");
	}
	return context.activeMembership;
};

export const requireSessionUserId = (context: {
	session: {
		user: {
			id: string;
		};
	} | null;
}) => {
	const userId = context.session?.user.id;
	if (!userId) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return userId;
};
