import type { AppRouterClient } from "@my-app/api/routers";
import { createMockChargeNotificationTool } from "./tools/create-mock-charge-notification";
import { createCreateTodoTool } from "./tools/create-todo";
import { createListTodosTool } from "./tools/list-todos";
import { createScheduleRecurringReminderTool } from "./tools/schedule-recurring-reminder";
import { createWhoAmITool } from "./tools/whoami";
import { createListClustersTool } from "./tools/youtube/list-clusters";
import { createListVideosTool } from "./tools/youtube/list-videos";
import { createSearchSignalsTool } from "./tools/youtube/search-signals";
import { createSearchYouTubeTool } from "./tools/youtube/search-youtube";
import { createSubmitVideoTool } from "./tools/youtube/submit-video";
import { createTriggerDiscoveryTool } from "./tools/youtube/trigger-discovery";
import { createUpdateClusterStateTool } from "./tools/youtube/update-cluster-state";

export const createAssistantTools = (client: AppRouterClient) => {
	return {
		whoami: createWhoAmITool(client),
		listTodos: createListTodosTool(client),
		createTodo: createCreateTodoTool(client),
		scheduleRecurringReminder: createScheduleRecurringReminderTool(client),
		createMockChargeNotification: createMockChargeNotificationTool(client),
		// YouTube playtest feedback tools
		ytSearchSignals: createSearchSignalsTool(client),
		ytSearchYouTube: createSearchYouTubeTool(client),
		ytListVideos: createListVideosTool(client),
		ytListClusters: createListClustersTool(client),
		ytSubmitVideo: createSubmitVideoTool(client),
		ytTriggerDiscovery: createTriggerDiscoveryTool(client),
		ytUpdateClusterState: createUpdateClusterStateTool(client),
	};
};
