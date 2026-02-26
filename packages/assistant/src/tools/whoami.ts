import type { AppRouterClient } from "@my-app/api/routers";
import { orpcTool } from "../lib/orpc-tool";
import z from "zod";

const getUserName = (
	user: Record<string, unknown> | undefined
): string | null => {
	if (!user) {
		return null;
	}

	const name = user.name;
	if (typeof name === "string" && name.trim().length > 0) {
		return name;
	}

	const email = user.email;
	if (typeof email === "string" && email.trim().length > 0) {
		return email;
	}

	return null;
};

export const createWhoAmITool = (client: AppRouterClient) =>
	orpcTool(
		z.object({}),
		"Return current authenticated user identity, including display name and active organization role when available.",
		async () => {
			const privateData = await client.privateData();
			const user = privateData.user;

			let role: string | null = null;
			let organizationId: string | null = null;

			try {
				const orgAccess = await client.canManageOrganization();
				role = orgAccess.role;
				organizationId = orgAccess.organizationId;
			} catch {
				role = null;
				organizationId = null;
			}

			return {
				name: getUserName(user),
				role,
				organizationId,
				isAuthenticated: Boolean(user),
			};
		},
	);
