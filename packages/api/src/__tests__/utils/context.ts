import type { Context } from "../../context";

type MembershipRole = NonNullable<Context["activeMembership"]>["role"];

interface BaseContextParams {
	requestUrl: string;
	requestHostname?: string;
	notificationQueue?: Context["notificationQueue"];
}

export const createManagedContext = (
	params: BaseContextParams & {
		userId: string;
		organizationId: string;
		role: MembershipRole;
	}
): Context => ({
	session: {
		user: {
			id: params.userId,
		},
	} as Context["session"],
	activeMembership: {
		organizationId: params.organizationId,
		role: params.role,
	},
	requestUrl: params.requestUrl,
	requestHostname: params.requestHostname ?? "localhost",
	notificationQueue: params.notificationQueue,
});

export const createUserContext = (
	params: BaseContextParams & {
		userId: string;
	}
): Context => ({
	session: {
		user: {
			id: params.userId,
		},
	} as Context["session"],
	activeMembership: null,
	requestUrl: params.requestUrl,
	requestHostname: params.requestHostname ?? "localhost",
	notificationQueue: params.notificationQueue,
});

export const createPublicContext = (params: BaseContextParams): Context => ({
	session: null,
	activeMembership: null,
	requestUrl: params.requestUrl,
	requestHostname: params.requestHostname ?? "localhost",
	notificationQueue: params.notificationQueue,
});
