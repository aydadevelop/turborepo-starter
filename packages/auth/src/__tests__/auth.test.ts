import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestAuth, type TestAuth, type TestHelpers } from "../test";

describe("Authentication", () => {
	let testAuth: TestAuth;
	let test: TestHelpers;

	beforeAll(async () => {
		testAuth = await createTestAuth();
		test = testAuth.test;
	}, 30_000);

	afterAll(async () => {
		await testAuth.close();
	});

	beforeEach(async () => {
		await testAuth.clearDb();
	});

	describe("Sign Up", () => {
		it("can sign up a new user with email/password", async () => {
			const response = await testAuth.auth.api.signUpEmail({
				body: {
					name: "Test User",
					email: "test@example.com",
					password: "SecurePassword123!",
				},
			});

			expect(response.user).toBeDefined();
			expect(response.user.email).toBe("test@example.com");
			expect(response.user.name).toBe("Test User");
			// Token is returned instead of full session object
			expect(response.token).toBeDefined();
		});

		it("rejects duplicate email registration", async () => {
			// First signup
			await testAuth.auth.api.signUpEmail({
				body: {
					name: "First User",
					email: "duplicate@example.com",
					password: "Password123!",
				},
			});

			// Second signup with same email should fail
			await expect(
				testAuth.auth.api.signUpEmail({
					body: {
						name: "Second User",
						email: "duplicate@example.com",
						password: "Password456!",
					},
				})
			).rejects.toThrow();
		});

		it("rejects weak passwords", async () => {
			await expect(
				testAuth.auth.api.signUpEmail({
					body: {
						name: "Test User",
						email: "test@example.com",
						password: "weak",
					},
				})
			).rejects.toThrow();
		});
	});

	describe("Sign In", () => {
		const testUser = {
			name: "Login Test User",
			email: "login@example.com",
			password: "SecurePassword123!",
		};

		beforeEach(async () => {
			await testAuth.auth.api.signUpEmail({
				body: testUser,
			});
		});

		it("can sign in with correct credentials", async () => {
			const response = await testAuth.auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			});

			expect(response.user).toBeDefined();
			expect(response.user.email).toBe(testUser.email);
			expect(response.token).toBeDefined();
		});

		it("rejects incorrect password", async () => {
			await expect(
				testAuth.auth.api.signInEmail({
					body: {
						email: testUser.email,
						password: "WrongPassword123!",
					},
				})
			).rejects.toThrow();
		});
	});

	describe("Sign In edge cases", () => {
		it("rejects non-existent email", async () => {
			await expect(
				testAuth.auth.api.signInEmail({
					body: {
						email: "nonexistent@example.com",
						password: "SomePassword123!",
					},
				})
			).rejects.toThrow();
		});
	});

	describe("Session Management", () => {
		it("login creates a valid session with token", async () => {
			const user = test.createUser({ email: "session@example.com" });
			await test.saveUser(user);

			const { token, session } = await test.login({ userId: user.id });

			expect(token).toBeTruthy();
			expect(session).toBeDefined();
			expect(session.userId).toBe(user.id);
		});
	});

	describe("Auth Helpers (testUtils)", () => {
		it("getAuthHeaders returns headers that authenticate requests", async () => {
			const user = test.createUser({ email: "headers@example.com" });
			await test.saveUser(user);

			const headers = await test.getAuthHeaders({ userId: user.id });
			const session = await testAuth.auth.api.getSession({ headers });

			expect(session?.user.id).toBe(user.id);
			expect(session?.user.email).toBe("headers@example.com");
		});

		it("login returns session, headers, cookies, and token", async () => {
			const user = test.createUser({ email: "login-helper@example.com" });
			await test.saveUser(user);

			const result = await test.login({ userId: user.id });

			expect(result.session).toBeDefined();
			expect(result.session.userId).toBe(user.id);
			expect(result.headers).toBeInstanceOf(Headers);
			expect(result.cookies).toBeInstanceOf(Array);
			expect(result.cookies.length).toBeGreaterThan(0);
			expect(result.token).toBeTruthy();
		});

		it("saveUser and deleteUser manage DB records", async () => {
			const user = test.createUser({ email: "save-delete@example.com" });
			const saved = await test.saveUser(user);

			expect(saved.id).toBe(user.id);
			expect(saved.email).toBe("save-delete@example.com");

			// Confirm user is accessible via a session before deletion
			const headers = await test.getAuthHeaders({ userId: user.id });
			const session = await testAuth.auth.api.getSession({ headers });
			expect(session?.user.id).toBe(user.id);

			await test.deleteUser(user.id);
		});
	});
});
