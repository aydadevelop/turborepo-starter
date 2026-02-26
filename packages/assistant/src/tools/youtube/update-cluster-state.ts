import { updateClusterStateInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcMutationTool } from "../../lib/orpc-tool";

export const createUpdateClusterStateTool = (client: AppRouterClient) =>
	orpcMutationTool(
		updateClusterStateInputSchema,
		"Update the state of a feedback issue cluster (Sentry-like workflow). Transitions: open → acknowledged → in_progress → fixed. Can also mark as ignored or regression.",
		async (input) => {
			const result = await client.youtube.clusters.updateState(input);
			return result;
		},
	);
