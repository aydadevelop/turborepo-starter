<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@full-stack-cf-app/ui/components/card";
	import { formatHourMinute, weekdayLabels } from "./boat-page-utils";

	interface MinDurationRule {
		id: string;
		name: string;
		startHour: number;
		startMinute: number;
		endHour: number;
		endMinute: number;
		minimumDurationMinutes: number;
		daysOfWeek: unknown;
		isActive: boolean;
	}

	interface Props {
		rules: MinDurationRule[];
	}

	const { rules }: Props = $props();
</script>

<Card class="lg:col-span-3">
	<CardHeader>
		<CardTitle>Minimum Duration Rules</CardTitle>
		<CardDescription>
			Time windows that require longer minimum bookings.
		</CardDescription>
	</CardHeader>
	<CardContent>
		{#if rules.length === 0}
			<p class="text-sm text-muted-foreground">
				No minimum duration rules configured.
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full min-w-[700px] text-left text-sm">
					<thead class="text-muted-foreground">
						<tr class="border-b border-border">
							<th class="py-2">Name</th>
							<th class="py-2">Window (Local)</th>
							<th class="py-2">Min Duration</th>
							<th class="py-2">Days</th>
							<th class="py-2">Active</th>
						</tr>
					</thead>
					<tbody>
						{#each rules as rule (rule.id)}
							<tr class="border-b border-border/50">
								<td class="py-2 font-medium text-foreground">{rule.name}</td>
								<td class="py-2">
									{formatHourMinute(rule.startHour, rule.startMinute, 0)}→
									{formatHourMinute(rule.endHour, rule.endMinute, 0)}
								</td>
								<td class="py-2">
									{rule.minimumDurationMinutes >= 60
										? `${(rule.minimumDurationMinutes / 60).toFixed(
												rule.minimumDurationMinutes % 60 === 0 ? 0 : 1,
											)}h`
										: `${rule.minimumDurationMinutes}m`}
								</td>
								<td class="py-2">
									{#if rule.daysOfWeek && Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length > 0}
										{rule.daysOfWeek
											.map(
												(d) =>
													weekdayLabels[
														Math.max(0, Math.min(6, Math.trunc(d as number)))
													],
											)
											.join(", ")}
									{:else}
										Every day
									{/if}
								</td>
								<td class="py-2">{rule.isActive ? "✓" : "✗"}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</CardContent>
</Card>
