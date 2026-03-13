import { type DefaultOptions, QueryClient } from "@tanstack/svelte-query";
import { type Component, flushSync, mount, unmount } from "svelte";
import { page } from "vitest/browser";
import QueryHarness from "./QueryHarness.svelte";

type BrowserRenderable = Component<any>;

const DEFAULT_QUERY_OPTIONS: DefaultOptions = {
	queries: {
		retry: false,
	},
};

const activeCleanups = new Set<() => Promise<void>>();

const registerCleanup = (cleanup: () => Promise<void>) => {
	const wrappedCleanup = async () => {
		if (!activeCleanups.has(wrappedCleanup)) {
			return;
		}
		activeCleanups.delete(wrappedCleanup);
		await cleanup();
	};
	activeCleanups.add(wrappedCleanup);
	return wrappedCleanup;
};

const createCleanup = (instance: object, target: HTMLDivElement) =>
	registerCleanup(async () => {
		await Promise.resolve(unmount(instance));
		target.remove();
	});

export const cleanupBrowserMounts = async () => {
	for (const cleanup of [...activeCleanups]) {
		await cleanup();
	}
	document.body.innerHTML = "";
};

export const renderComponent = <Props extends Record<string, unknown>>(
	component: Component<any>,
	props: Props
) => {
	const target = document.createElement("div");
	document.body.append(target);

	const instance = mount(component as unknown as BrowserRenderable, {
		target,
		props: props as Record<string, unknown>,
	});
	flushSync();

	return {
		cleanup: createCleanup(instance, target),
		container: target,
		locator: page.elementLocator(target),
	};
};

export const renderWithQueryClient = <Props extends Record<string, unknown>>(
	component: Component<any>,
	props?: Props
) => {
	const target = document.createElement("div");
	document.body.append(target);

	const client = new QueryClient({
		defaultOptions: DEFAULT_QUERY_OPTIONS,
	});

	const instance = mount(QueryHarness, {
		target,
		props: {
			client,
			component: component as unknown as BrowserRenderable,
			props: (props ?? {}) as Record<string, unknown>,
		},
	});
	flushSync();

	return {
		client,
		cleanup: createCleanup(instance, target),
		container: target,
		locator: page.elementLocator(target),
	};
};
