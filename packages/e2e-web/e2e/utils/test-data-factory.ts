import type pg from "pg";
import { cleanupNamespace, createDbClient } from "./db-client";

const LEADING_SLASHES_RE = /^\/+/;

interface CreatedUser {
	email: string;
	id: string;
	name: string;
}

interface CreatedOrganization {
	id: string;
	name: string;
	slug: string;
}

interface ApiResult {
	json: unknown;
	ok: boolean;
	status: number;
}

export class TestDataFactory {
	private readonly namespace: string;
	private readonly serverURL: string;
	private userCounter = 0;
	private orgCounter = 0;
	private dbClient: pg.Client | null = null;
	private cookies: string | null = null;

	constructor(namespace: string, serverURL: string) {
		this.namespace = namespace;
		this.serverURL = serverURL;
	}

	/**
	 * Create a new user via the auth sign-up API.
	 * Returns the created user data.
	 */
	async createUser(
		overrides: { name?: string; password?: string } = {}
	): Promise<CreatedUser> {
		const n = ++this.userCounter;
		const email = `${this.namespace}-user-${n}@test.local`;
		const name = overrides.name ?? `Test User ${n}`;
		const password = overrides.password ?? "test-password-123";

		const result = await this.serverFetch("/api/auth/sign-up/email", {
			method: "POST",
			body: { name, email, password },
		});

		if (!result.ok) {
			throw new Error(
				`TestDataFactory.createUser failed (${result.status}): ${JSON.stringify(result.json)}`
			);
		}

		const body = result.json as { user?: { id?: string } };
		return {
			id: body.user?.id ?? `${this.namespace}-user-${n}`,
			email,
			name,
		};
	}

	/**
	 * Sign in as a previously created user, storing the session cookie for
	 * subsequent authenticated requests from this factory instance.
	 */
	async signIn(email: string, password: string): Promise<void> {
		const response = await fetch(`${this.serverURL}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email, password }),
			redirect: "manual",
		});

		if (!response.ok) {
			throw new Error(`TestDataFactory.signIn failed (${response.status})`);
		}

		const setCookie = response.headers.getSetCookie?.() ?? [];
		this.cookies = setCookie.join("; ");
	}

	/**
	 * Create an organization via the RPC endpoint.
	 * Requires a prior `signIn()` call for authentication cookies.
	 */
	async createOrganization(
		overrides: { name?: string; slug?: string } = {}
	): Promise<CreatedOrganization> {
		const n = ++this.orgCounter;
		const name = overrides.name ?? `${this.namespace} Org ${n}`;
		const slug = overrides.slug ?? `${this.namespace}-org-${n}`;

		const result = await this.rpcFetch("organizations/create", {
			name,
			slug,
		});

		if (!result.ok) {
			throw new Error(
				`TestDataFactory.createOrganization failed (${result.status}): ${JSON.stringify(result.json)}`
			);
		}

		const body = result.json as { json?: { id?: string } };
		return {
			id: body.json?.id ?? `${this.namespace}-org-${n}`,
			name,
			slug,
		};
	}

	/**
	 * Remove all entities created under this namespace.
	 * Called automatically by the `testData` fixture teardown.
	 */
	async cleanup(): Promise<void> {
		try {
			const client = await this.getDbClient();
			await cleanupNamespace(client, this.namespace);
		} catch (error) {
			// Cleanup is best-effort — don't fail the test if DB is unreachable
			console.warn(
				`[TestDataFactory] cleanup for namespace "${this.namespace}" failed:`,
				error
			);
		} finally {
			if (this.dbClient) {
				await this.dbClient.end().catch(() => undefined);
				this.dbClient = null;
			}
		}
	}

	// ─── Internal helpers ───────────────────────────────────────────────

	private async getDbClient(): Promise<pg.Client> {
		if (!this.dbClient) {
			this.dbClient = await createDbClient();
		}
		return this.dbClient;
	}

	private async serverFetch(
		path: string,
		options: { method: string; body?: unknown }
	): Promise<ApiResult> {
		const headers: Record<string, string> = {};
		if (options.body) {
			headers["content-type"] = "application/json";
		}
		if (this.cookies) {
			headers.cookie = this.cookies;
		}

		const response = await fetch(`${this.serverURL}${path}`, {
			method: options.method,
			headers,
			body: options.body ? JSON.stringify(options.body) : undefined,
			redirect: "manual",
		});

		const text = await response.text();
		let json: unknown = null;
		try {
			json = JSON.parse(text);
		} catch {
			json = null;
		}

		return { ok: response.ok, status: response.status, json };
	}

	private async rpcFetch(
		procedurePath: string,
		input?: unknown
	): Promise<ApiResult> {
		const normalized = procedurePath.replace(LEADING_SLASHES_RE, "");
		return await this.serverFetch(`/rpc/${normalized}`, {
			method: "POST",
			body: { json: input ?? null },
		});
	}
}
