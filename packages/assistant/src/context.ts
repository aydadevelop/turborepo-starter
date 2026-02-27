import type { AppContractClient } from "@my-app/api-contract/routers";
import type { Session, User } from "better-auth";

export interface AssistantContext {
	aiModel: string;
	openRouterApiKey: string;
	serverClient: AppContractClient;
	session: { user: User; session: Session } | null;
}
