import { describe, expect, it } from "vitest";

import { hasOrganizationPermission } from "../organization";

// ─── YouTube Feed Permissions ────────────────────────────────────────────────

describe("yt_feed permissions", () => {
	it("org_owner has full CRUD", () => {
		for (const op of ["create", "read", "update", "delete"] as const) {
			expect(hasOrganizationPermission("org_owner", { yt_feed: [op] })).toBe(
				true
			);
		}
	});

	it("org_admin has full CRUD", () => {
		for (const op of ["create", "read", "update", "delete"] as const) {
			expect(hasOrganizationPermission("org_admin", { yt_feed: [op] })).toBe(
				true
			);
		}
	});

	it("manager can create, read, update but not delete", () => {
		for (const op of ["create", "read", "update"] as const) {
			expect(hasOrganizationPermission("manager", { yt_feed: [op] })).toBe(
				true
			);
		}
		expect(hasOrganizationPermission("manager", { yt_feed: ["delete"] })).toBe(
			false
		);
	});

	it("agent can only read", () => {
		expect(hasOrganizationPermission("agent", { yt_feed: ["read"] })).toBe(
			true
		);
		for (const op of ["create", "update", "delete"] as const) {
			expect(hasOrganizationPermission("agent", { yt_feed: [op] })).toBe(false);
		}
	});

	it("member can only read", () => {
		expect(hasOrganizationPermission("member", { yt_feed: ["read"] })).toBe(
			true
		);
		expect(hasOrganizationPermission("member", { yt_feed: ["create"] })).toBe(
			false
		);
	});

	it("customer has no access", () => {
		for (const op of ["create", "read", "update", "delete"] as const) {
			expect(hasOrganizationPermission("customer", { yt_feed: [op] })).toBe(
				false
			);
		}
	});
});

// ─── YouTube Video Permissions ───────────────────────────────────────────────

describe("yt_video permissions", () => {
	it("org_owner has full CRUD", () => {
		for (const op of ["create", "read", "update", "delete"] as const) {
			expect(hasOrganizationPermission("org_owner", { yt_video: [op] })).toBe(
				true
			);
		}
	});

	it("manager can create, read, update but not delete", () => {
		for (const op of ["create", "read", "update"] as const) {
			expect(hasOrganizationPermission("manager", { yt_video: [op] })).toBe(
				true
			);
		}
		expect(hasOrganizationPermission("manager", { yt_video: ["delete"] })).toBe(
			false
		);
	});

	it("agent can create and read but not update or delete", () => {
		expect(hasOrganizationPermission("agent", { yt_video: ["create"] })).toBe(
			true
		);
		expect(hasOrganizationPermission("agent", { yt_video: ["read"] })).toBe(
			true
		);
		expect(hasOrganizationPermission("agent", { yt_video: ["update"] })).toBe(
			false
		);
		expect(hasOrganizationPermission("agent", { yt_video: ["delete"] })).toBe(
			false
		);
	});

	it("member can only read", () => {
		expect(hasOrganizationPermission("member", { yt_video: ["read"] })).toBe(
			true
		);
		expect(hasOrganizationPermission("member", { yt_video: ["create"] })).toBe(
			false
		);
	});

	it("customer has no access", () => {
		for (const op of ["create", "read", "update", "delete"] as const) {
			expect(hasOrganizationPermission("customer", { yt_video: [op] })).toBe(
				false
			);
		}
	});
});

// ─── YouTube Signal Permissions ──────────────────────────────────────────────

describe("yt_signal permissions", () => {
	it("org_owner has full CRUD", () => {
		for (const op of ["create", "read", "update", "delete"] as const) {
			expect(hasOrganizationPermission("org_owner", { yt_signal: [op] })).toBe(
				true
			);
		}
	});

	it("manager can only read signals", () => {
		expect(hasOrganizationPermission("manager", { yt_signal: ["read"] })).toBe(
			true
		);
		for (const op of ["create", "update", "delete"] as const) {
			expect(hasOrganizationPermission("manager", { yt_signal: [op] })).toBe(
				false
			);
		}
	});

	it("agent can only read signals", () => {
		expect(hasOrganizationPermission("agent", { yt_signal: ["read"] })).toBe(
			true
		);
		expect(hasOrganizationPermission("agent", { yt_signal: ["create"] })).toBe(
			false
		);
	});

	it("member can only read signals", () => {
		expect(hasOrganizationPermission("member", { yt_signal: ["read"] })).toBe(
			true
		);
		expect(hasOrganizationPermission("member", { yt_signal: ["create"] })).toBe(
			false
		);
	});

	it("customer has no signal access", () => {
		for (const op of ["create", "read", "update", "delete"] as const) {
			expect(hasOrganizationPermission("customer", { yt_signal: [op] })).toBe(
				false
			);
		}
	});
});

// ─── YouTube Cluster Permissions ─────────────────────────────────────────────

describe("yt_cluster permissions", () => {
	it("org_owner has full CRUD", () => {
		for (const op of ["create", "read", "update", "delete"] as const) {
			expect(hasOrganizationPermission("org_owner", { yt_cluster: [op] })).toBe(
				true
			);
		}
	});

	it("org_admin has full CRUD", () => {
		for (const op of ["create", "read", "update", "delete"] as const) {
			expect(hasOrganizationPermission("org_admin", { yt_cluster: [op] })).toBe(
				true
			);
		}
	});

	it("manager can create, read, update clusters but not delete", () => {
		for (const op of ["create", "read", "update"] as const) {
			expect(hasOrganizationPermission("manager", { yt_cluster: [op] })).toBe(
				true
			);
		}
		expect(
			hasOrganizationPermission("manager", { yt_cluster: ["delete"] })
		).toBe(false);
	});

	it("agent can only read clusters", () => {
		expect(hasOrganizationPermission("agent", { yt_cluster: ["read"] })).toBe(
			true
		);
		for (const op of ["create", "update", "delete"] as const) {
			expect(hasOrganizationPermission("agent", { yt_cluster: [op] })).toBe(
				false
			);
		}
	});

	it("member can only read clusters", () => {
		expect(hasOrganizationPermission("member", { yt_cluster: ["read"] })).toBe(
			true
		);
		expect(
			hasOrganizationPermission("member", { yt_cluster: ["create"] })
		).toBe(false);
	});

	it("customer has no cluster access", () => {
		for (const op of ["create", "read", "update", "delete"] as const) {
			expect(hasOrganizationPermission("customer", { yt_cluster: [op] })).toBe(
				false
			);
		}
	});
});

// ─── Cross-role Boundary Checks ─────────────────────────────────────────────

describe("cross-role boundary checks", () => {
	it("unknown roles are rejected for all yt permissions", () => {
		for (const resource of [
			"yt_feed",
			"yt_video",
			"yt_signal",
			"yt_cluster",
		] as const) {
			expect(
				hasOrganizationPermission("unknown_role", { [resource]: ["read"] })
			).toBe(false);
		}
	});

	it("owner alias has same access as org_owner", () => {
		for (const resource of [
			"yt_feed",
			"yt_video",
			"yt_signal",
			"yt_cluster",
		] as const) {
			for (const op of ["create", "read", "update", "delete"] as const) {
				expect(hasOrganizationPermission("owner", { [resource]: [op] })).toBe(
					hasOrganizationPermission("org_owner", { [resource]: [op] })
				);
			}
		}
	});

	it("admin alias has same access as org_admin", () => {
		for (const resource of [
			"yt_feed",
			"yt_video",
			"yt_signal",
			"yt_cluster",
		] as const) {
			for (const op of ["create", "read", "update", "delete"] as const) {
				expect(hasOrganizationPermission("admin", { [resource]: [op] })).toBe(
					hasOrganizationPermission("org_admin", { [resource]: [op] })
				);
			}
		}
	});
});
