/**
 * Performance budgets per page.
 * All sizes in bytes, all times in milliseconds.
 */

export interface PageBudget {
	/** Largest Contentful Paint (ms) */
	lcp: number;
	/** Cumulative Layout Shift (unitless) */
	cls: number;
	/** First Contentful Paint (ms) */
	fcp: number;
	/** Time to First Byte (ms) */
	ttfb: number;
	/** Total transferred size (bytes) */
	totalSize: number;
	/** Total JS transferred size (bytes) */
	jsSize: number;
	/** Max memory heap usage (MB) */
	maxHeapMB: number;
}

const defaults: PageBudget = {
	lcp: 2500,
	cls: 0.1,
	fcp: 1800,
	ttfb: 800,
	totalSize: 2_000_000, // 2 MB
	jsSize: 800_000, // 800 KB
	maxHeapMB: 100,
};

export const budgets: Record<string, Partial<PageBudget>> = {
	"/": {
		lcp: 2500,
		totalSize: 1_500_000,
		jsSize: 500_000,
	},
	"/login": {
		lcp: 2000,
		totalSize: 1_000_000,
		jsSize: 400_000,
	},
	"/dashboard": {
		lcp: 3000,
		totalSize: 2_000_000,
		jsSize: 800_000,
	},
	"/boats": {
		lcp: 3000,
		totalSize: 2_500_000,
		jsSize: 800_000,
	},
	"/chat": {
		lcp: 3000,
		totalSize: 2_000_000,
		jsSize: 800_000,
	},
	"/bookings": {
		lcp: 3000,
		totalSize: 2_000_000,
		jsSize: 800_000,
	},
};

/** Resolve a full budget for a route, filling missing fields from defaults. */
export const getBudget = (route: string): PageBudget => ({
	...defaults,
	...budgets[route],
});
