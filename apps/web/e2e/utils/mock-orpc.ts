import type { Page } from "@playwright/test";
import type { UIMessage } from "ai";
import { buildTextStream } from "./stream-protocol";

// ─── Generic RPC mock ────────────────────────────────────────────────

/**
 * Intercept any `/rpc/<path>` POST and return a static JSON response.
 *
 * @example
 * ```ts
 * await mockRpcEndpoint(page, "todos/list", { json: { items: [] } });
 * ```
 */
export const mockRpcEndpoint = async (
	page: Page,
	rpcPath: string,
	responseBody: unknown,
	status = 200
): Promise<void> => {
	await page.route(`**/rpc/${rpcPath}`, async (route) => {
		if (route.request().method() === "POST") {
			await route.fulfill({
				status,
				contentType: "application/json",
				body: JSON.stringify(responseBody),
			});
		} else {
			await route.continue();
		}
	});
};

// ─── Auth session mock ───────────────────────────────────────────────

interface MockUser {
	email?: string;
	id?: string;
	image?: string | null;
	isAnonymous?: boolean;
	name?: string;
	role?: string;
}

/**
 * Intercept the auth session endpoint and return a mock user.
 * Useful for frontend-only tests that need an "authenticated" state
 * without hitting a real backend.
 */
export const mockAuthSession = async (
	page: Page,
	userOverrides: MockUser = {}
): Promise<void> => {
	const user = {
		id: "mock-user-id",
		name: "Mock User",
		email: "mock@test.local",
		role: "user",
		isAnonymous: false,
		image: null,
		...userOverrides,
	};

	await page.route("**/api/auth/get-session", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				session: {
					id: "mock-session-id",
					userId: user.id,
					expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
				},
				user,
			}),
		});
	});
};

// ─── Organization mocks ──────────────────────────────────────────────

interface MockOrganization {
	id: string;
	logo?: string | null;
	name: string;
	slug: string;
}

/**
 * Mock the organization list endpoint for OrgSwitcher / OrgGuard tests.
 */
export const mockOrganizations = async (
	page: Page,
	organizations: MockOrganization[]
): Promise<void> => {
	await mockRpcEndpoint(page, "organizations/list", {
		json: organizations,
	});
};

// ─── Notification mocks ──────────────────────────────────────────────

interface MockNotification {
	body?: string | null;
	ctaUrl?: string | null;
	deliveredAt?: string;
	id: string;
	severity?: string;
	title: string;
	viewedAt?: string | null;
}

/**
 * Mock the in-app notification list endpoint.
 */
export const mockNotifications = async (
	page: Page,
	items: MockNotification[],
	unread?: number
): Promise<void> => {
	await mockRpcEndpoint(page, "notifications/listMe", {
		json: {
			items,
			unread: unread ?? items.filter((i) => !i.viewedAt).length,
		},
	});
};

// ─── Chat history mock ───────────────────────────────────────────────

/**
 * Mocks the initial chat history load by intercepting the getChat RPC.
 */
export const mockChatHistory = async (
	page: Page,
	chatId: string,
	messages: UIMessage[]
): Promise<void> => {
	await mockRpcEndpoint(page, "getChat", {
		json: {
			id: chatId,
			title: "Mocked Chat",
			userId: "mock-user",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			messages,
		},
	});
};

// ─── Chat stream mock ────────────────────────────────────────────────

/**
 * Mocks a streaming chat response using the AI SDK Data Stream Protocol.
 *
 * @param page - Playwright Page instance
 * @param body - Pre-built stream body (use helpers from `stream-protocol.ts`)
 *
 * @example
 * ```ts
 * import { buildTextStream } from "./stream-protocol";
 * await mockChatStream(page, buildTextStream("Hello!"));
 * ```
 */
export const mockChatStream = async (
	page: Page,
	body?: string
): Promise<void> => {
	const streamBody = body ?? buildTextStream("Mocked assistant response.");

	await page.route("**/rpc/chat", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "text/plain; charset=utf-8",
			body: streamBody,
		});
	});
};
