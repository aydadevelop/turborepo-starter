<script lang="ts">
	let {
		email,
		userId,
	}: {
		email: string;
		userId?: string | null;
	} = $props();
</script>

<span
	class="text-muted-foreground"
	data-testid={userId ? `org-member-email-${userId}` : undefined}
>
	{email}
</span>