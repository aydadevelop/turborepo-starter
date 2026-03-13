<script lang="ts">
	import { Separator } from "@my-app/ui/components/separator";
	import AccountSettingsSection from "./AccountSettingsSection.svelte";

	type UserProfile = {
		name?: string | null;
		email?: string | null;
	};

	let {
		user,
		phoneNumber,
	}: {
		user: UserProfile | null | undefined;
		phoneNumber: string | null;
	} = $props();
</script>

<AccountSettingsSection title="Profile">
	{#snippet children()}
		<div class="flex items-center justify-between text-sm">
			<span class="text-muted-foreground">Name</span>
			<span>{user?.name ?? "—"}</span>
		</div>
		<Separator />
		<div class="flex items-center justify-between text-sm">
			<span class="text-muted-foreground">Email</span>
			<span>{user?.email ?? "—"}</span>
		</div>
		{#if phoneNumber}
			<Separator />
			<div class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground">Phone</span>
				<span>{phoneNumber}</span>
			</div>
		{/if}
	{/snippet}
</AccountSettingsSection>
