import { db } from "@full-stack-cf-app/db";
import { user } from "@full-stack-cf-app/db/schema/auth";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

import { o, protectedProcedure } from "../index";

const requirePlatformAdmin = o.middleware(async ({ context, next }) => {
	const userId = context.session?.user?.id;
	if (!userId) {
		throw new ORPCError("UNAUTHORIZED");
	}

	const [dbUser] = await db
		.select({ role: user.role })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);

	if (!dbUser || dbUser.role !== "admin") {
		throw new ORPCError("FORBIDDEN", {
			message: "Platform admin access required",
		});
	}

	return next({
		context: {
			adminUserId: userId,
		},
	});
});

export const adminProcedure = protectedProcedure.use(requirePlatformAdmin);

export interface AdminContext {
	adminUserId: string;
}
