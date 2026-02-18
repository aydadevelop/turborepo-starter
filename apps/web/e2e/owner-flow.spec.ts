import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { url } from "./helpers";

const SERVER_URL =
	process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:43100";
const D1_DATABASE_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../.alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject"
);
const DASHBOARD_URL_RE = /\/dashboard/;

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
				headers: body
					? {
							"content-type": "application/json",
						}
					: undefined,
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
			return {
				absolutePath,
				mtimeMs: statSync(absolutePath).mtimeMs,
			};
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

const bootstrapOwnerOrganizationFixture = async (input: {
	runId: string;
	sessionToken: string;
	userId: string;
}) => {
	const organizationId = `e2e_org_${input.runId}`;
	const organizationSlug = `e2e-owner-${input.runId}`;
	const memberId = `e2e_member_${input.runId}`;
	const now = Date.now();
	const databasePath = await resolveLocalD1DatabasePath(input.sessionToken);
	const client = createClient({ url: `file:${databasePath}` });

	try {
		await client.execute({
			sql: `INSERT INTO organization (id, name, slug, logo, metadata, created_at)
            VALUES (?, ?, ?, NULL, ?, ?)
            ON CONFLICT(id) DO UPDATE
            SET name = excluded.name,
                slug = excluded.slug,
                metadata = excluded.metadata`,
			args: [
				organizationId,
				"E2E Owner Organization",
				organizationSlug,
				JSON.stringify({ seedNamespace: "e2e-owner-flow" }),
				now,
			],
		});

		await client.execute({
			sql: `INSERT INTO member (id, organization_id, user_id, role, created_at)
            VALUES (?, ?, ?, 'org_owner', ?)
            ON CONFLICT(organization_id, user_id) DO UPDATE
            SET role = excluded.role`,
			args: [memberId, organizationId, input.userId, now],
		});

		const updateSessionResult = await client.execute({
			sql: "UPDATE session SET active_organization_id = ? WHERE token = ?",
			args: [organizationId, input.sessionToken],
		});

		if ((updateSessionResult.rowsAffected ?? 0) === 0) {
			throw new Error(
				`Could not bind active organization to session token ${input.sessionToken}`
			);
		}
	} finally {
		await client.close();
	}
};

test.describe("Owner Flow", () => {
	test("new owner can sign up and access owner capability", async ({
		page,
	}) => {
		const runId = uniqueId();
		const ownerName = `Owner ${runId}`;
		const ownerEmail = `owner-${runId}@e2e.local`;
		const ownerPassword = `Passw0rd!${runId}`;

		await page.goto(url("/"));

		const signUpResult = await browserRequest(page, {
			path: "/api/auth/sign-up/email",
			method: "POST",
			body: {
				name: ownerName,
				email: ownerEmail,
				password: ownerPassword,
			},
		});
		expect(signUpResult.ok).toBe(true);
		expect(signUpResult.status).toBe(200);
		const signUpPayload = signUpResult.json as {
			token?: string;
			user?: { id?: string };
		};
		expect(signUpPayload.token).toBeTruthy();
		expect(signUpPayload.user?.id).toBeTruthy();

		if (!(signUpPayload.token && signUpPayload.user?.id)) {
			throw new Error(
				`sign-up payload missing token or user id: ${signUpResult.text || "<empty>"}`
			);
		}

		await bootstrapOwnerOrganizationFixture({
			runId,
			sessionToken: signUpPayload.token,
			userId: signUpPayload.user.id,
		});

		await page.goto(url("/dashboard"));

		await expect(page).toHaveURL(DASHBOARD_URL_RE);
		await expect(
			page.getByRole("heading", { name: "Dashboard", exact: true })
		).toBeVisible();

		const permissionCheckResult = await browserRequest(page, {
			path: "/rpc/canManageOrganization",
			method: "POST",
			body: { json: {} },
		});

		expect(
			permissionCheckResult.ok,
			`canManageOrganization failed with ${permissionCheckResult.status}: ${permissionCheckResult.text || "<empty>"}`
		).toBe(true);
		expect(permissionCheckResult.status).toBe(200);

		const permissionData = permissionCheckResult.json as {
			json?: {
				canManageOrganization?: boolean;
				role?: string;
			};
		};
		expect(permissionData.json?.canManageOrganization).toBe(true);
		expect(permissionData.json?.role).toBe("org_owner");

		await page.goto(
			url(
				"/boats/seed_boat_aurora--seed-aurora-8?date=2026-03-16&durationHours=2&passengers=2"
			)
		);
		await expect(page.getByText(`Signed in as ${ownerEmail}`)).toBeVisible();
	});
});
