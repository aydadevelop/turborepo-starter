<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import { resolve } from "$app/paths";
	import AccountSettingsSection from "./AccountSettingsSection.svelte";
</script>

<AccountSettingsSection
	title="Organizations"
	description="Create or join organizations to collaborate."
>
	{#snippet footer()}
		<Button href={resolve("/org/create")} variant="outline" size="sm">
			+ New Organization
		</Button>
	{/snippet}
</AccountSettingsSection>
