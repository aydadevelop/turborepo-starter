<script lang="ts">
	import { QueryClientProvider } from "@tanstack/svelte-query";
	import { SvelteQueryDevtools } from "@tanstack/svelte-query-devtools";
	import { browser } from "$app/environment";
	import { page } from "$app/state";
	import "../app.css";
	import { queryClient } from "$lib/orpc";
	import Header from "../components/Header.svelte";

	const { children } = $props();
	const affiliateCookieName = "affiliate_ref";
	const affiliateQueryKeys = ["aff", "affiliate", "ref"] as const;
	const affiliateCodeRegex = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;
	const affiliateCookieMaxAgeSeconds = 30 * 24 * 60 * 60;
	type CookieStoreSameSite = "lax" | "strict" | "none";
	type CookieStoreSetOptions = {
		name: string;
		value: string;
		path?: string;
		expires?: number | Date;
		sameSite?: CookieStoreSameSite;
	};
	type CookieStoreLike = {
		set: (options: CookieStoreSetOptions) => Promise<void>;
	};

	const normalizeAffiliateCode = (value: string): string | null => {
		const normalized = value.trim();
		if (!affiliateCodeRegex.test(normalized)) {
			return null;
		}
		return normalized;
	};

	const getCookieStore = (): CookieStoreLike | null => {
		if (!("cookieStore" in globalThis)) {
			return null;
		}

		const runtime = globalThis as typeof globalThis & {
			cookieStore?: CookieStoreLike;
		};

		return runtime.cookieStore ?? null;
	};

	const persistAffiliateCookie = (code: string): void => {
		const cookieStore = getCookieStore();
		if (!cookieStore) {
			return;
		}

		cookieStore
			.set({
				name: affiliateCookieName,
				value: code,
				path: "/",
				expires: Date.now() + affiliateCookieMaxAgeSeconds * 1000,
				sameSite: "lax",
			})
			.catch(() => undefined);
	};

	$effect(() => {
		if (!browser) {
			return;
		}

		for (const key of affiliateQueryKeys) {
			const rawValue = page.url.searchParams.get(key);
			if (!rawValue) {
				continue;
			}

			const code = normalizeAffiliateCode(rawValue);
			if (!code) {
				continue;
			}

			persistAffiliateCookie(code);
			break;
		}
	});
</script>

<QueryClientProvider client={queryClient}>
	<div class="grid h-svh grid-rows-[auto_1fr]">
		<Header />
		<main class="overflow-y-auto">{@render children()}</main>
	</div>
	<SvelteQueryDevtools />
</QueryClientProvider>
