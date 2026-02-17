<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from "@full-stack-cf-app/ui/components/card";
	import {
		formatRuleAdjustment,
		formatRuleCondition,
		type PublicPricingRule,
	} from "./boat-page-utils";

	interface Props {
		rules: (PublicPricingRule & {
			id: string;
			name: string;
			priority: number;
		})[];
		currency: string;
	}

	const { rules, currency }: Props = $props();
</script>

<Card class="lg:col-span-3">
	<CardHeader>
		<CardTitle>Pricing Rules</CardTitle>
		<CardDescription>
			Active pricing rules for this boat/date window.
		</CardDescription>
	</CardHeader>
	<CardContent>
		{#if rules.length === 0}
			<p class="text-sm text-muted-foreground">
				No active pricing rules for this date.
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full min-w-[900px] text-left text-sm">
					<thead class="text-muted-foreground">
						<tr class="border-b border-border">
							<th class="py-2">Name</th>
							<th class="py-2">Type</th>
							<th class="py-2">Scope</th>
							<th class="py-2">Condition</th>
							<th class="py-2">Adjustment</th>
							<th class="py-2">Priority</th>
						</tr>
					</thead>
					<tbody>
						{#each rules as rule (rule.id)}
							<tr class="border-b border-border/50">
								<td class="py-2 font-medium text-foreground">{rule.name}</td>
								<td class="py-2">{rule.ruleType}</td>
								<td class="py-2">
									{rule.pricingProfileId ? "Profile" : "Global"}
								</td>
								<td class="py-2">{formatRuleCondition(rule)}</td>
								<td class="py-2">{formatRuleAdjustment(rule, currency)}</td>
								<td class="py-2">{rule.priority}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</CardContent>
</Card>
