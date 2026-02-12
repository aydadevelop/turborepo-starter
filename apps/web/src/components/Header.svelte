<script lang="ts">
	import NotificationCenter from "./NotificationCenter.svelte";
	import UserMenu from "./UserMenu.svelte";

	const links = [
		{ to: "/", label: "Home" },
		{ to: "/boats", label: "Boats" },
		{ to: "/dashboard", label: "Dashboard" },
		{ to: "/todos", label: "Todos" },
	];
</script>

<header
	class="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur"
>
	<div
		class="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4"
	>
		<a href="/" class="flex items-center gap-3">
			<span
				class="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
			>
				CF
			</span>
			<span class="text-sm font-semibold text-muted-foreground">
				Cloudflare App
			</span>
		</a>
		<nav
			class="hidden items-center gap-6 text-sm text-muted-foreground md:flex"
		>
			{#each links as link (link.to)}
				<a href={link.to} class="transition hover:text-foreground">
					{link.label}
				</a>
			{/each}
		</nav>
		<div class="flex items-center gap-2">
			<NotificationCenter />
			<UserMenu />
		</div>
	</div>
</header>
