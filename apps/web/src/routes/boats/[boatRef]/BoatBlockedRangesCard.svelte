<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@full-stack-cf-app/ui/components/card";
	import {
		formatBlockSourceLabel,
		formatDateTimeInZone,
		formatDateTimeIsoUtc,
		formatDateTimeUtc,
	} from "./boat-page-utils";

	interface AvailabilityBlock {
		id: string;
		source: string;
		startsAt: Date;
		endsAt: Date;
		reason: string | null;
	}

	interface Props {
		blocks: AvailabilityBlock[];
		timezone: string;
	}

	const { blocks, timezone }: Props = $props();
</script>

<Card class="lg:col-span-3">
	<CardHeader>
		<CardTitle>Blocked Date Ranges</CardTitle>
		<CardDescription>
			Active maintenance and calendar/manual blocks applied to this boat.
		</CardDescription>
	</CardHeader>
	<CardContent>
		{#if blocks.length === 0}
			<p class="text-sm text-muted-foreground">
				No active blocked date ranges.
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full min-w-[1100px] text-left text-sm">
					<thead class="text-muted-foreground">
						<tr class="border-b border-border">
							<th class="py-2">Source</th>
							<th class="py-2">Start (Local)</th>
							<th class="py-2">End (Local)</th>
							<th class="py-2">Start (UTC ISO)</th>
							<th class="py-2">End (UTC ISO)</th>
							<th class="py-2">Reason</th>
						</tr>
					</thead>
					<tbody>
						{#each blocks as block (block.id)}
							<tr class="border-b border-border/50">
								<td class="py-2 font-medium text-foreground">
									{formatBlockSourceLabel(block.source)}
								</td>
								<td class="py-2">
									<div>{formatDateTimeInZone(block.startsAt, timezone)}</div>
									<div class="text-xs text-muted-foreground">
										{formatDateTimeUtc(block.startsAt)} UTC
									</div>
								</td>
								<td class="py-2">
									<div>{formatDateTimeInZone(block.endsAt, timezone)}</div>
									<div class="text-xs text-muted-foreground">
										{formatDateTimeUtc(block.endsAt)} UTC
									</div>
								</td>
								<td class="py-2 font-mono text-xs">
									{formatDateTimeIsoUtc(block.startsAt)}
								</td>
								<td class="py-2 font-mono text-xs">
									{formatDateTimeIsoUtc(block.endsAt)}
								</td>
								<td class="py-2">{block.reason ?? "—"}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</CardContent>
</Card>
