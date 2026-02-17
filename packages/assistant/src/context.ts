import type { Session, User } from "better-auth";

export interface AssistantContext {
	session: { user: User; session: Session } | null;
	requestHeaders: Headers;
	openRouterApiKey: string;
	aiModel: string;
	serverUrl: string;
}
