import { organization } from "@my-app/db/schema/auth";
import { bootstrapTestDatabase } from "@my-app/db/test";
import { describe, expect, it, vi } from "vitest";

const testDbState = bootstrapTestDatabase();

vi.doMock("@my-app/db", () => ({
	get db() {
		return testDbState.db;
	},
}));

const {
	getContaktlyWidgetAdminConfig,
	resolveContaktlyWidgetConfig,
	saveContaktlyWidgetAdminConfig,
} = await import("../lib/contaktly-widget-config");

describe("contaktly widget config", () => {
	it("returns the seeded fallback booking URL when no override exists", async () => {
		const config = await getContaktlyWidgetAdminConfig("ctly-demo-founder");

		expect(config.configId).toBe("ctly-demo-founder");
		expect(config.bookingUrl).toBe("https://calendly.com/");
		expect(config.allowedDomains).toContain("localhost");
	});

	it("persists a manual booking URL and exposes it to the public widget runtime", async () => {
		await testDbState.db.insert(organization).values({
			id: "ctly-org-1",
			name: "Contaktly Org",
			slug: "contaktly-org-1",
		});

		await saveContaktlyWidgetAdminConfig({
			configId: "ctly-demo-founder",
			bookingUrl: "https://calendly.com/demo-team/intro",
			organizationId: "ctly-org-1",
		});

		const adminConfig =
			await getContaktlyWidgetAdminConfig("ctly-demo-founder");
		const publicConfig =
			await resolveContaktlyWidgetConfig("ctly-demo-founder");

		expect(adminConfig.bookingUrl).toBe("https://calendly.com/demo-team/intro");
		expect(publicConfig.bookingUrl).toBe(
			"https://calendly.com/demo-team/intro"
		);
		expect(publicConfig.starterCards).toContain("I need a website redesign");
		expect(publicConfig.botName).toBe("Ava");
	});

	it("rejects non-http booking URLs", async () => {
		await testDbState.db.insert(organization).values({
			id: "ctly-org-2",
			name: "Contaktly Org 2",
			slug: "contaktly-org-2",
		});

		await expect(
			saveContaktlyWidgetAdminConfig({
				configId: "ctly-demo-founder",
				bookingUrl: "javascript:alert(1)",
				organizationId: "ctly-org-2",
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});
});
