import { test as base, type Page } from "@playwright/test";
import { getBudget, type PageBudget } from "./budgets";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface WebVitals {
	lcp: number | null;
	cls: number | null;
	fcp: number | null;
}

export interface NavigationMetrics {
	ttfb: number;
	domContentLoaded: number;
	loadComplete: number;
	domProcessing: number;
}

export interface ResourceMetrics {
	totalSize: number;
	jsSize: number;
	cssSize: number;
	imageSize: number;
	resourceCount: number;
	slowResources: { name: string; duration: number; size: number }[];
}

export interface MemorySnapshot {
	usedJSHeapSizeMB: number;
	totalJSHeapSizeMB: number;
}

export interface FrameMetrics {
	fps: number;
	longFrames: number;
	totalFrames: number;
	droppedFramePercent: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Inject web-vitals observers before any navigation. */
const injectVitalsObservers = async (page: Page): Promise<void> => {
	await page.addInitScript(() => {
		const win = window as Record<string, unknown>;
		win.__vitals = { lcp: null, cls: 0, fcp: null };

		// LCP
		new PerformanceObserver((list) => {
			const entries = list.getEntries();
			if (entries.length > 0) {
				(win.__vitals as Record<string, unknown>).lcp =
					entries.at(-1).startTime;
			}
		}).observe({ type: "largest-contentful-paint", buffered: true });

		// CLS
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const shift = entry as PerformanceEntry & {
					hadRecentInput: boolean;
					value: number;
				};
				if (!shift.hadRecentInput) {
					(win.__vitals as Record<string, unknown>).cls =
						((win.__vitals as Record<string, unknown>).cls as number) +
						shift.value;
				}
			}
		}).observe({ type: "layout-shift", buffered: true });

		// FCP
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (entry.name === "first-contentful-paint") {
					(win.__vitals as Record<string, unknown>).fcp = entry.startTime;
				}
			}
		}).observe({ type: "paint", buffered: true });
	});
};

const collectVitals = (page: Page): Promise<WebVitals> =>
	page.evaluate(
		() => (window as unknown as Record<string, unknown>).__vitals as WebVitals
	);

const collectNavigation = (page: Page): Promise<NavigationMetrics> =>
	page.evaluate(() => {
		const nav = performance.getEntriesByType(
			"navigation"
		)[0] as PerformanceNavigationTiming;
		return {
			ttfb: nav.responseStart - nav.requestStart,
			domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
			loadComplete: nav.loadEventEnd - nav.startTime,
			domProcessing: nav.domComplete - nav.domInteractive,
		};
	});

const collectResources = (page: Page): Promise<ResourceMetrics> =>
	page.evaluate(() => {
		const entries = performance.getEntriesByType(
			"resource"
		) as PerformanceResourceTiming[];
		const byType = (type: string) =>
			entries
				.filter((e) => e.initiatorType === type)
				.reduce((sum, e) => sum + (e.transferSize || 0), 0);

		const slow = entries
			.filter((e) => e.duration > 1000)
			.map((e) => ({
				name: e.name.split("/").pop() ?? e.name,
				duration: Math.round(e.duration),
				size: e.transferSize || 0,
			}));

		return {
			totalSize: entries.reduce((sum, e) => sum + (e.transferSize || 0), 0),
			jsSize: byType("script"),
			cssSize: byType("link") + byType("style"),
			imageSize: byType("img"),
			resourceCount: entries.length,
			slowResources: slow,
		};
	});

const collectMemory = (page: Page): Promise<MemorySnapshot | null> =>
	page.evaluate(() => {
		const mem = (performance as unknown as Record<string, unknown>).memory as
			| Record<string, number>
			| undefined;
		if (!mem) {
			return null;
		}
		return {
			usedJSHeapSizeMB: mem.usedJSHeapSize / 1024 / 1024,
			totalJSHeapSizeMB: mem.totalJSHeapSize / 1024 / 1024,
		};
	});

/**
 * Measure frame rate during a scroll/interaction action.
 * Returns FPS estimation and dropped-frame stats.
 */
const measureFrames = async (
	page: Page,
	action: () => Promise<void>,
	durationMs = 3000
): Promise<FrameMetrics> => {
	// Start frame counting
	await page.evaluate(() => {
		const win = window as Record<string, unknown>;
		win.__frameTimestamps = [] as number[];
		win.__frameCounting = true;
		const loop = (ts: number) => {
			if (!(win.__frameCounting as boolean)) {
				return;
			}
			(win.__frameTimestamps as number[]).push(ts);
			requestAnimationFrame(loop);
		};
		requestAnimationFrame(loop);
	});

	await action();
	await page.waitForTimeout(durationMs);

	// Stop and collect
	return page.evaluate(() => {
		const win = window as Record<string, unknown>;
		win.__frameCounting = false;
		const timestamps = win.__frameTimestamps as number[];
		if (timestamps.length < 2) {
			return { fps: 0, longFrames: 0, totalFrames: 0, droppedFramePercent: 0 };
		}

		const deltas: number[] = [];
		for (let i = 1; i < timestamps.length; i++) {
			deltas.push(timestamps[i] - timestamps[i - 1]);
		}

		const totalTimeMs = timestamps.at(-1) - timestamps[0];
		const fps = totalTimeMs > 0 ? (deltas.length / totalTimeMs) * 1000 : 0;
		const longFrames = deltas.filter((d) => d > 50).length; // > 50ms = below 20fps threshold
		const droppedFramePercent =
			deltas.length > 0 ? (longFrames / deltas.length) * 100 : 0;

		return {
			fps: Math.round(fps),
			longFrames,
			totalFrames: deltas.length,
			droppedFramePercent: Math.round(droppedFramePercent * 10) / 10,
		};
	});
};

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

interface PerfFixtures {
	/** Inject web-vital observers into the page. Call before navigating. */
	injectVitals: () => Promise<void>;
	/** Collect accumulated web vitals from the page. */
	getVitals: () => Promise<WebVitals>;
	/** Collect navigation timing metrics. */
	getNavigation: () => Promise<NavigationMetrics>;
	/** Collect resource loading metrics. */
	getResources: () => Promise<ResourceMetrics>;
	/** Collect JS heap memory snapshot (Chrome only). */
	getMemory: () => Promise<MemorySnapshot | null>;
	/** Measure frame rate during an interaction. */
	measureFrames: (
		action: () => Promise<void>,
		durationMs?: number
	) => Promise<FrameMetrics>;
	/** Get the performance budget for a route. */
	budgetFor: (route: string) => PageBudget;
}

export const test = base.extend<PerfFixtures>({
	injectVitals: async ({ page }, use) => {
		await use(() => injectVitalsObservers(page));
	},
	getVitals: async ({ page }, use) => {
		await use(() => collectVitals(page));
	},
	getNavigation: async ({ page }, use) => {
		await use(() => collectNavigation(page));
	},
	getResources: async ({ page }, use) => {
		await use(() => collectResources(page));
	},
	getMemory: async ({ page }, use) => {
		await use(() => collectMemory(page));
	},
	measureFrames: async ({ page }, use) => {
		await use((action, durationMs) => measureFrames(page, action, durationMs));
	},
	budgetFor: async (_fixtures, use) => {
		await use(getBudget);
	},
});

// Re-export expect for test files
// biome-ignore lint/performance/noBarrelFile: intentional re-export for test convenience
export { expect } from "@playwright/test";
