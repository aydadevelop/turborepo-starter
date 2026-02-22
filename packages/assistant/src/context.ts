import type { AppRouterClient } from "@my-app/api/routers";
import type { Session, User } from "better-auth";

export interface AssistantContext {
	aiModel: string;
	openRouterApiKey: string;
	serverClient: AppRouterClient;
	session: { user: User; session: Session } | null;
}
