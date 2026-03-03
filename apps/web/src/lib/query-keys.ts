/**
 * Centralised query-key factory.
 *
 * Every key used across the app should be sourced from here so that
 * invalidation, prefetching, and deduplication are type-safe and
 * never diverge due to a string typo.
 */
export const queryKeys = {
	// ── Auth / session-scoped ───────────────────────────
	organizations: {
		all: ["user-organizations"] as const,
	},
	invitations: {
		all: ["user-invitations"] as const,
	},
	linkedAccounts: {
		all: ["linked-accounts"] as const,
	},

	// ── Active-org scoped ──────────────────────────────
	org: {
		root: ["organization"] as const,
		full: ["organization", "full"] as const,
		canManage: ["canManageOrganization"] as const,
	},

	notifications: {
		root: ["notifications"] as const,
	},

	todos: {
		root: ["todos"] as const,
	},

	assistant: {
		root: ["assistant"] as const,
		chats: ["assistant", "chats"] as const,
		chat: (chatId: string) => ["assistant", "chat", chatId] as const,
	},

	// ── Admin ──────────────────────────────────────────
	admin: {
		root: ["admin"] as const,
	},
} as const;
