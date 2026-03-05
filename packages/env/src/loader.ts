import { existsSync } from "node:fs";
import { config } from "dotenv";

/**
 * Load .env files in priority order (first match wins for each key).
 * Works in both Node.js and Bun — uses dotenv so no runtime branching needed.
 */
export const loadEnvFiles = (files: string[]): void => {
	for (const file of files) {
		if (existsSync(file)) {
			config({ path: file, override: false });
		}
	}
};

/** Read a string env var, trimming whitespace. Returns fallback if unset or blank. */
export const readStringEnv = (key: string, fallback: string): string => {
	const value = process.env[key];
	if (!value) {
		return fallback;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : fallback;
};

/** Read a positive integer env var. Returns fallback if unset, non-numeric, or ≤ 0. */
export const readPositiveIntEnv = (key: string, fallback: number): number => {
	const raw = process.env[key];
	if (!raw) {
		return fallback;
	}
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
