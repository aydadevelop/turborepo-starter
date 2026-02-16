import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";

const SERVER_URL = process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:3000";
const D1_DATABASE_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../.alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject"
);

const DASHBOARD_URL_RE = /\/dashboard/;
const ADMIN_USERS_URL_RE = /\/admin\/users/;
const IMPERSONATING_RE = /You are impersonating/i;

const uniqueId = () =>
	`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface BrowserFetchResult {
	ok: boolean;
	status: number;
	url: string;
	contentType: string | null;
	text: string;
	json: unknown;
}

const browserRequest = async (
	page: Page,
	options: {
		path: string;
		method?: "GET" | "POST";
		body?: Record<string, unknown>;
	}
): Promise<BrowserFetchResult> =>
	await page.evaluate(
		async ({ body, method, path, serverUrl }) => {
			const response = await fetch(`${serverUrl}${path}`, {
				method,
				credentials: "include",
				headers: body ? { "content-type": "application/json" } : undefined,
				body: body ? JSON.stringify(body) : undefined,
			});

			const text = await response.text();
			let json: unknown = null;
			if (text.length > 0) {
				try {
					json = JSON.parse(text);
				} catch {
					json = null;
				}
			}

			return {
				ok: response.ok,
				status: response.status,
				url: response.url,
				contentType: response.headers.get("content-type"),
				text,
				json,
			};
		},
		{
			path: options.path,
			method: options.method ?? "GET",
			body: options.body,
			serverUrl: SERVER_URL,
		}
	);

const listLocalD1DatabasePaths = () =>
	readdirSync(D1_DATABASE_DIR)
		.filter(
			(filename) =>
				filename.endsWith(".sqlite") &&
				!filename.includes("-wal") &&
				!filename.includes("-shm")
		)
		.map((filename) => {
			const absolutePath = path.join(D1_DATABASE_DIR, filename);
			return { absolutePath, mtimeMs: statSync(absolutePath).mtimeMs };
		})
		.sort((a, b) => b.mtimeMs - a.mtimeMs)
		.map((entry) => entry.absolutePath);

const resolveLocalD1DatabasePath = async (sessionToken: string) => {
	const databasePaths = listLocalD1DatabasePaths();
	const latestDatabasePath = databasePaths[0];
	if (!latestDatabasePath) {
		throw new Error(
			`No local D1 sqlite database found under ${D1_DATABASE_DIR}. Run the local server once before E2E.`
		);
	}

	for (const databasePath of databasePaths) {
		const client = createClient({ url: `file:${databasePath}` });
		try {
			const hasSession = await client.execute(
				"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session' LIMIT 1"
			);
			if (hasSession.rows.length === 0) {
				continue;
			}

			const matchingSession = await client.execute({
				sql: "SELECT 1 FROM session WHERE token = ? LIMIT 1",
				args: [sessionToken],
			});
			if (matchingSession.rows.length > 0) {
				return databasePath;
			}
		} finally {
			await client.close();
		}
	}

	return latestDatabasePath;
};

const bootstrapAdminWithTargetUser = async (input: {
	runId: string;
	adminSessionToken: string;
	adminUserId: string;
	targetUserId: string;
}) => {
	const now = Date.now();
	const databasePath = await resolveLocalD1DatabasePath(
		input.adminSessionToken
	);
	const client = createClient({ url: `file:${databasePath}` });

	const adminOrgId = `e2e_admin_org_${input.runId}`;
	const targetOrg1Id = `e2e_target_org1_${input.runId}`;
	const targetOrg2Id = `e2e_target_org2_${input.runId}`;

	try {
		// Make the admin user an admin
		await client.execute({
			sql: "UPDATE user SET role = 'admin' WHERE id = ?",
			args: [input.adminUserId],
		});

		// Create admin's org + membership
		await client.execute({
			sql: `INSERT INTO organization (id, name, slug, logo, metadata, created_at)
				VALUES (?, ?, ?, NULL, ?, ?)
				ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
			args: [
				adminOrgId,
				"E2E Admin Org",
				`e2e-admin-${input.runId}`,
				JSON.stringify({ seedNamespace: "e2e-impersonation" }),
				now,
			],
		});
		await client.execute({
			sql: `INSERT INTO member (id, organization_id, user_id, role, created_at)
				VALUES (?, ?, ?, 'org_owner', ?)
				ON CONFLICT(organization_id, user_id) DO UPDATE SET role = excluded.role`,
			args: [
				`e2e_admin_member_${input.runId}`,
				adminOrgId,
				input.adminUserId,
				now,
			],
		});

		// Set active org for admin session
		await client.execute({
			sql: "UPDATE session SET active_organization_id = ? WHERE token = ?",
			args: [adminOrgId, input.adminSessionToken],
		});

		// Create 2 orgs for target user
		for (const [idx, orgId, orgName] of [
			[1, targetOrg1Id, "E2E Target Org Alpha"],
			[2, targetOrg2Id, "E2E Target Org Beta"],
		] as const) {
			await client.execute({
				sql: `INSERT INTO organization (id, name, slug, logo, metadata, created_at)
					VALUES (?, ?, ?, NULL, ?, ?)
					ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
				args: [
					orgId,
					orgName,
					`e2e-target-${idx}-${input.runId}`,
					JSON.stringify({ seedNamespace: "e2e-impersonation" }),
					now,
				],
			});
			await client.execute({
				sql: `INSERT INTO member (id, organization_id, user_id, role, created_at)
					VALUES (?, ?, ?, 'org_owner', ?)
					ON CONFLICT(organization_id, user_id) DO UPDATE SET role = excluded.role`,
				args: [
					`e2e_target_member_${idx}_${input.runId}`,
					orgId,
					input.targetUserId,
					now,
				],
			});
		}
	} finally {
		await client.close();
	}

	return { adminOrgId, targetOrg1Id, targetOrg2Id };
};

test.describe("Impersonation & Org Switching", () => {
	test("admin can impersonate user, see org switcher, switch orgs, and stop", async ({
		page,
	}) => {
		const runId = uniqueId();

		// ── Sign up admin user ──
		await page.goto("/");
		const adminEmail = `admin-${runId}@e2e.local`;
		const adminSignUp = await browserRequest(page, {
			path: "/api/auth/sign-up/email",
			method: "POST",
			body: {
				name: `E2E Admin ${runId}`,
				email: adminEmail,
				password: `Passw0rd!${runId}`,
			},
		});
		expect(adminSignUp.ok).toBe(true);
		const adminPayload = adminSignUp.json as {
			token: string;
			user: { id: string };
		};
		expect(adminPayload.token).toBeTruthy();
		expect(adminPayload.user?.id).toBeTruthy();

		// ── Sign up target user (in a separate browser context) ──
		const targetEmail = `target-${runId}@e2e.local`;
		const targetSignUp = await browserRequest(page, {
			path: "/api/auth/sign-up/email",
			method: "POST",
			body: {
				name: `E2E Target ${runId}`,
				email: targetEmail,
				password: `Passw0rd!${runId}`,
			},
		});
		expect(targetSignUp.ok).toBe(true);
		const targetPayload = targetSignUp.json as {
			token: string;
			user: { id: string };
		};
		expect(targetPayload.user?.id).toBeTruthy();

		// ── Sign back in as admin (target sign-up replaced the session) ──
		const adminSignIn = await browserRequest(page, {
			path: "/api/auth/sign-in/email",
			method: "POST",
			body: { email: adminEmail, password: `Passw0rd!${runId}` },
		});
		expect(adminSignIn.ok).toBe(true);
		const adminSession = adminSignIn.json as { token: string };
		expect(adminSession.token).toBeTruthy();

		// ── Bootstrap DB: make admin, create 2 orgs for target ──
		await bootstrapAdminWithTargetUser({
			runId,
			adminSessionToken: adminSession.token,
			adminUserId: adminPayload.user.id,
			targetUserId: targetPayload.user.id,
		});

		// ── Navigate to admin users page ──
		await page.goto("/admin/users");
		await expect(
			page.getByRole("heading", { name: "Users", exact: true })
		).toBeVisible();

		// ── Find and click Impersonate for the target user ──
		const targetRow = page
			.locator("table tbody tr")
			.filter({ hasText: targetEmail });
		await expect(targetRow).toBeVisible();
		await targetRow.getByRole("button", { name: "Impersonate" }).click();

		// ── Verify impersonation banner ──
		await expect(page).toHaveURL(DASHBOARD_URL_RE);
		await expect(page.getByText(IMPERSONATING_RE)).toBeVisible();
		await expect(page.getByText(`E2E Target ${runId}`)).toBeVisible();

		// ── Verify org switcher is visible with target user's orgs ──
		const orgTrigger = page.getByRole("combobox");
		await expect(orgTrigger).toBeVisible({ timeout: 5000 });

		// ── Open the org switcher and check both orgs are listed ──
		await orgTrigger.click();
		await expect(
			page.getByRole("option", { name: "E2E Target Org Alpha" })
		).toBeVisible();
		await expect(
			page.getByRole("option", { name: "E2E Target Org Beta" })
		).toBeVisible();

		// ── Switch to the other org ──
		await page.getByRole("option", { name: "E2E Target Org Beta" }).click();

		// Wait for the switcher to update
		await expect(orgTrigger).toContainText("E2E Target Org Beta", {
			timeout: 5000,
		});

		// ── Stop impersonating ──
		await page.getByRole("button", { name: "Stop impersonating" }).click();

		// ── Verify we're back on admin page with no banner ──
		await expect(page).toHaveURL(ADMIN_USERS_URL_RE, { timeout: 5000 });
		await expect(page.getByText(IMPERSONATING_RE)).not.toBeVisible();
	});
});
