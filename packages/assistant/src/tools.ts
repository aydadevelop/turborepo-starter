import type { AppContractClient } from "@my-app/api-contract/routers";
import { createMockChargeNotificationTool } from "./tools/create-mock-charge-notification";
import { createCreateTodoTool } from "./tools/create-todo";
import { createListTodosTool } from "./tools/list-todos";
import { createScheduleRecurringReminderTool } from "./tools/schedule-recurring-reminder";
import { createWhoAmITool } from "./tools/whoami";

export const createAssistantTools = (client: AppContractClient) => {
	return {
		whoami: createWhoAmITool(client),
		listTodos: createListTodosTool(client),
		createTodo: createCreateTodoTool(client),
		scheduleRecurringReminder: createScheduleRecurringReminderTool(client),
		createMockChargeNotification: createMockChargeNotificationTool(client),
	};
};
