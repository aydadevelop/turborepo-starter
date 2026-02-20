import type { AppRouterClient } from "@my-app/api/routers";
import type { Session, User } from "better-auth";

export interface AssistantContext {
	session: { user: User; session: Session } | null;
	openRouterApiKey: string;
	aiModel: string;
	serverClient: AppRouterClient;
}
