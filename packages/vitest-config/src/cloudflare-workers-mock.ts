// Mock for cloudflare:workers module in test environment
// Provides default values for required environment variables

const testEnv = {
	...process.env,
	// Required base Cloudflare environment variables
	CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
	BETTER_AUTH_SECRET:
		process.env.BETTER_AUTH_SECRET ?? "test-secret-key-16-chars-minimum",
	SERVER_URL: process.env.SERVER_URL ?? "http://localhost:3000",
	BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
};

export const env = testEnv;
