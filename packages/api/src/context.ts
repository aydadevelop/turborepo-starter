import { auth } from "@full-stack-cf-app/auth";
import { db } from "@full-stack-cf-app/db";
import { member } from "@full-stack-cf-app/db/schema/auth";
import { and, eq } from "drizzle-orm";
import type { Context as HonoContext } from "hono";

export interface CreateContextOptions {
	context: HonoContext;
}

type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;

export interface ActiveOrganizationMembership {
	organizationId: string;
	role: string;
}

const getActiveOrganizationMembership = async (
	session: AuthSession
): Promise<ActiveOrganizationMembership | null> => {
	const activeOrganizationId = getActiveOrganizationId(session);
	const userId = session?.user?.id;

	if (!(activeOrganizationId && userId)) {
		return null;
	}

	const [activeMembership] = await db
		.select({
			organizationId: member.organizationId,
			role: member.role,
		})
		.from(member)
		.where(
			and(
				eq(member.organizationId, activeOrganizationId),
				eq(member.userId, userId)
			)
		)
		.limit(1);

	return activeMembership ?? null;
};

const getActiveOrganizationId = (session: AuthSession) => {
	if (!session) {
		return null;
	}

	const authSession = session.session as typeof session.session & {
		activeOrganizationId?: string | null;
	};

	return authSession.activeOrganizationId ?? null;
};

export async function createContext({ context }: CreateContextOptions) {
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});

	const activeMembership = await getActiveOrganizationMembership(session);

	return {
		session,
		activeMembership,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
