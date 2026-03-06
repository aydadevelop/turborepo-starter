<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	const { children } = $props();

	const navItems = [
		{
			href: "/dashboard/contaktly",
			key: "overview",
			label: "Overview",
		},
		{
			href: "/dashboard/contaktly/analytics",
			key: "analytics",
			label: "Analytics",
		},
		{
			href: "/dashboard/contaktly/conversations",
			key: "conversations",
			label: "Conversations",
		},
		{
			href: "/dashboard/contaktly/meetings",
			key: "meetings",
			label: "Meetings",
		},
		{
			href: "/dashboard/contaktly/knowledge",
			key: "knowledge",
			label: "Knowledge",
		},
		{
			href: "/dashboard/contaktly/widget",
			key: "widget",
			label: "Widget",
		},
		{
			href: "/dashboard/contaktly/prefill",
			key: "prefill",
			label: "Prefill",
		},
	] as const;

	const currentPathname = $derived(page.url.pathname);

	const isActive = (href: string) =>
		currentPathname === href || currentPathname.startsWith(`${href}/`);
</script>

<div class="mx-auto max-w-6xl px-6 pt-6">
	<nav class="flex flex-wrap gap-2" data-testid="contaktly-subnav">
		{#each navItems as item}
			<a
				class={`rounded-full border px-4 py-2 text-sm font-medium transition ${
					isActive(item.href)
						? "border-primary bg-primary text-primary-foreground"
						: "border-border bg-background text-foreground hover:border-primary/40"
				}`}
				data-testid={`contaktly-subnav-${item.key}`}
				href={resolve(item.href)}
			>
				{item.label}
			</a>
		{/each}
	</nav>
</div>

{@render children()}
