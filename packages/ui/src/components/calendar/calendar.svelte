<script lang="ts">
	import {
		cn,
		type WithoutChildrenOrChild,
	} from "@full-stack-cf-app/ui/lib/utils";
	import { type DateValue, isEqualMonth } from "@internationalized/date";
	import { Calendar as CalendarPrimitive } from "bits-ui";
	import type { Snippet } from "svelte";
	import type { ButtonVariant } from "../button/button.svelte";
	import {
		Caption,
		Cell,
		Day,
		Grid,
		GridBody,
		GridHead,
		GridRow,
		HeadCell,
		Header,
		Month,
		Months,
		Nav,
		NextButton,
		PrevButton,
	} from "./index.js";

	let {
		ref = $bindable(null),
		value = $bindable(),
		placeholder = $bindable(),
		class: className,
		weekdayFormat = "short",
		buttonVariant = "ghost",
		captionLayout = "label",
		locale = "en-US",
		months: monthsProp,
		years,
		monthFormat: monthFormatProp,
		yearFormat = "numeric",
		day,
		disableDaysOutsideMonth = false,
		...restProps
	}: WithoutChildrenOrChild<CalendarPrimitive.RootProps> & {
		buttonVariant?: ButtonVariant;
		captionLayout?: "dropdown" | "dropdown-months" | "dropdown-years" | "label";
		months?: CalendarPrimitive.MonthSelectProps["months"];
		years?: CalendarPrimitive.YearSelectProps["years"];
		monthFormat?: CalendarPrimitive.MonthSelectProps["monthFormat"];
		yearFormat?: CalendarPrimitive.YearSelectProps["yearFormat"];
		day?: Snippet<[{ day: DateValue; outsideMonth: boolean }]>;
	} = $props();

	const monthFormat = $derived.by(() => {
		if (monthFormatProp) return monthFormatProp;
		if (captionLayout.startsWith("dropdown")) return "short";
		return "long";
	});
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
-->
<CalendarPrimitive.Root
	bind:value={value as never}
	bind:ref
	bind:placeholder
	{weekdayFormat}
	{disableDaysOutsideMonth}
	class={cn(
		"bg-background group/calendar p-3 [--cell-size:--spacing(8)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
		className
	)}
	{locale}
	{monthFormat}
	{yearFormat}
	{...restProps}
>
	{#snippet children({ months, weekdays })}
		<Months>
			<Nav>
				<PrevButton variant={buttonVariant} />
				<NextButton variant={buttonVariant} />
			</Nav>
			{#each months as month, monthIndex (month)}
				<Month>
					<Header>
						<Caption
							{captionLayout}
							months={monthsProp}
							{monthFormat}
							{years}
							{yearFormat}
							month={month.value}
							bind:placeholder
							{locale}
							{monthIndex}
						/>
					</Header>
					<Grid>
						<GridHead>
							<GridRow class="select-none">
								{#each weekdays as weekday (weekday)}
									<HeadCell>{weekday.slice(0, 2)}</HeadCell>
								{/each}
							</GridRow>
						</GridHead>
						<GridBody>
							{#each month.weeks as weekDates (weekDates)}
								<GridRow class="mt-2 w-full">
									{#each weekDates as date (date)}
										<Cell {date} month={month.value}>
											{#if day}
												{@render day({
													day: date,
													outsideMonth: !isEqualMonth(date, month.value),
												})}
											{:else}
												<Day />
											{/if}
										</Cell>
									{/each}
								</GridRow>
							{/each}
						</GridBody>
					</Grid>
				</Month>
			{/each}
		</Months>
	{/snippet}
</CalendarPrimitive.Root>
