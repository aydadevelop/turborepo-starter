import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestAuth, type TestAuth } from "../test";

describe("Authentication", () => {
	let testAuth: TestAuth;

	beforeEach(async () => {
		testAuth = await createTestAuth();
	});

	afterEach(() => {
		testAuth.close();
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

		it("rejects non-existent email", async () => {
			await expect(
				testAuth.auth.api.signInEmail({
					body: {
						email: "nonexistent@example.com",
						password: testUser.password,
					},
				})
			).rejects.toThrow();
		});
	});

	describe("Session Management", () => {
		it("creates a valid token on sign up", async () => {
			const signupResponse = await testAuth.auth.api.signUpEmail({
				body: {
					name: "Session User",
					email: "session@example.com",
					password: "SecurePassword123!",
				},
			});

			expect(signupResponse.token).toBeDefined();
			expect(signupResponse.token).toBeTruthy();
			expect(signupResponse.user).toBeDefined();
		});
	});
});
