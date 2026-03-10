import { ORPCError } from "@orpc/server";

import {
	organizationPermissionProcedure,
	publicProcedure,
	sessionProcedure,
} from "../index";
import { adminRouter } from "./admin/router";
import { availabilityRouter } from "./availability";
import { bookingRouter } from "./booking";
import { consentRouter } from "./consent";
import { listingRouter } from "./listing";
import { notificationsRouter } from "./notifications";
import { paymentsRouter } from "./payments";
import { pricingRouter } from "./pricing";
import { storefrontRouter } from "./storefront";
import { supportRouter } from "./support";
import { tasksRouter } from "./tasks";
import { todoRouter } from "./todo";

export const appRouter = publicProcedure.router({
	healthCheck: publicProcedure.healthCheck.handler(() => {
		return "OK";
	}),
	ping: publicProcedure.ping.handler(() => ({
		ok: true as const,
		ts: new Date().toISOString(),
		v: "1",
	})),
	privateData: sessionProcedure.privateData.handler(({ context }) => {
		return {
			message: "This is private",
			user: context.session?.user,
		};
	}),
	canManageOrganization: organizationPermissionProcedure({
		organization: ["update"],
	}).canManageOrganization.handler(({ context }) => {
		if (!context.activeMembership) {
			throw new ORPCError("FORBIDDEN");
		}

		return {
			canManageOrganization: true,
			organizationId: context.activeMembership.organizationId,
			role: context.activeMembership.role,
		};
	}),
	admin: adminRouter,
	availability: availabilityRouter,
	booking: bookingRouter,
	consent: consentRouter,
	listing: listingRouter,
	notifications: notificationsRouter,
	payments: paymentsRouter,
	pricing: pricingRouter,
	storefront: storefrontRouter,
	support: supportRouter,
	tasks: tasksRouter,
	todo: todoRouter,
});

export type AppRouter = typeof appRouter;
