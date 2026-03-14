import { expect } from "vitest";

/**
 * Parity test harness for brownfield domain extraction.
 *
 * Usage (in any domain package's __tests__/parity.test.ts):
 *
 *   const parityTest = createParityTest({
 *     domain: "bookings",
 *     description: "getActiveBookingCount returns same value as legacy",
 *     inputs: [{ listingId: "abc" }, { listingId: "def" }],
 *     legacyFn: async (input) => legacyGetActiveBookingCount(input),
 *     extractedFn: async (input) => newGetActiveBookingCount(input),
 *   })
 *
 *   it("parity: bookings.getActiveBookingCount", parityTest)
 *
 * The parity runner executes both functions on every input and asserts that
 * extracted output deep-equals the legacy output. Tests run entirely in-process
 * — no database connection required.
 */

export interface ParityDeclaration<TInput, TOutput> {
	/** What behavior is being validated */
	description: string;
	/** Human-readable domain name, e.g. "bookings" or "catalog.listings" */
	domain: string;
	/** Optional: custom equality check. Defaults to deep JSON comparison. */
	equals?: (legacy: TOutput, extracted: TOutput) => boolean;
	/** The extracted implementation under test. Must match legacyFn output. */
	extractedFn: (input: TInput) => TOutput | Promise<TOutput>;
	/** One or more input values to test. Each is run through both fns. */
	inputs: TInput[];
	/** The legacy truth-source function. Returns known-good output for each input. */
	legacyFn: (input: TInput) => TOutput | Promise<TOutput>;
}

export interface ParityResult<TOutput> {
	domain: string;
	extracted: TOutput;
	input: unknown;
	legacy: TOutput;
	pass: boolean;
}

/**
 * Returns a Vitest test function that, when passed to `it(...)`, runs the
 * parity check for every input and asserts that extracted output deep-equals
 * the legacy output.
 */
export const createParityTest = <TInput, TOutput>(
	decl: ParityDeclaration<TInput, TOutput>
): (() => Promise<void>) => {
	return async () => {
		for (const input of decl.inputs) {
			const [legacy, extracted] = await Promise.all([
				decl.legacyFn(input),
				decl.extractedFn(input),
			]);

			const pass = decl.equals
				? decl.equals(legacy, extracted)
				: JSON.stringify(legacy) === JSON.stringify(extracted);

			// Provide a rich failure message
			// biome-ignore lint/suspicious/noMisplacedAssertion: this callback is returned to Vitest and executed inside it().
			expect(
				pass,
				[
					`Parity failure — domain: ${decl.domain}`,
					`Description: ${decl.description}`,
					`Input: ${JSON.stringify(input)}`,
					`Legacy: ${JSON.stringify(legacy)}`,
					`Extracted: ${JSON.stringify(extracted)}`,
				].join("\n")
			).toBe(true);
		}
	};
};
