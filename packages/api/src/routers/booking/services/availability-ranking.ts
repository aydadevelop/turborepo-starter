interface AvailabilityBandSortItem {
	boat: {
		id: string;
	};
}

const seedFormatterByTimeZone = new Map<string, Intl.DateTimeFormat>();
const hourFormatterByTimeZone = new Map<string, Intl.DateTimeFormat>();

const getSeedFormatter = (timeZone: string) => {
	let formatter = seedFormatterByTimeZone.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat("en-US", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			hour12: false,
		});
		seedFormatterByTimeZone.set(timeZone, formatter);
	}
	return formatter;
};

const getHourFormatter = (timeZone: string) => {
	let formatter = hourFormatterByTimeZone.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat("en-US", {
			timeZone,
			hour: "2-digit",
			hour12: false,
		});
		hourFormatterByTimeZone.set(timeZone, formatter);
	}
	return formatter;
};

const getPartAsInt = (
	parts: Intl.DateTimeFormatPart[],
	type: Intl.DateTimeFormatPartTypes
) =>
	Number.parseInt(parts.find((part) => part.type === type)?.value ?? "0", 10);

const getHourSeed = (now: Date, timeZone: string) => {
	const parts = getSeedFormatter(timeZone).formatToParts(now);
	const year = getPartAsInt(parts, "year");
	const month = getPartAsInt(parts, "month");
	const day = getPartAsInt(parts, "day");
	const hour = getPartAsInt(parts, "hour");

	return year * 1_000_000 + month * 10_000 + day * 100 + hour;
};

const getHourInTimeZone = (date: Date, timeZone: string) =>
	Number.parseInt(getHourFormatter(timeZone).format(date), 10);

const UINT32_MOD = 4_294_967_296;

const hashStringToUInt32 = (value: string) => {
	let hash = 0;
	for (let index = 0; index < value.length; index++) {
		hash = (hash * 31 + value.charCodeAt(index)) % UINT32_MOD;
	}
	return hash;
};

const normalizeUnitInterval = (value: number) => {
	const fractional = value - Math.floor(value);
	if (fractional >= 0) {
		return fractional;
	}
	return fractional + 1;
};

const computeDeterministicRandomKey = (hourSeed: number, boatId: string) => {
	const boatHash = hashStringToUInt32(boatId);
	return normalizeUnitInterval(
		Math.sin(hourSeed * 12.9898 + boatHash * 78.233) * 43_758.5453
	);
};

const weightForHour = (hour: number): number => {
	if (hour >= 3 && hour < 12) {
		return 0;
	}
	if (hour >= 12 && hour < 16) {
		return 0.05;
	}
	if (hour >= 16 && hour < 24) {
		return 1;
	}
	return 0.1;
};

const resolveGroupCount = (count: number) => {
	if (count < 3) {
		return 1;
	}
	if (count < 8) {
		return 2;
	}
	return 3;
};

interface DecoratedAvailabilityBandSortItem<
	T extends AvailabilityBandSortItem,
> {
	item: T;
	rawAvailability: number;
	weightedAvailability: number;
	rand: number;
	group: number;
}

export const sortByAvailabilityBands = <T extends AvailabilityBandSortItem>(
	params: Readonly<{
		results: readonly T[];
		slotStartsByBoatId: ReadonlyMap<string, readonly Date[]>;
		now?: Date;
		seedTimeZone?: string;
	}>
): T[] => {
	if (params.results.length <= 1) {
		return [...params.results];
	}

	const seedTimeZone = params.seedTimeZone ?? "Europe/Moscow";
	const now = params.now ?? new Date();
	const hourSeed = getHourSeed(now, seedTimeZone);
	const currentHour = getHourInTimeZone(now, seedTimeZone);
	const groupCount = resolveGroupCount(params.results.length);

	const decorated: DecoratedAvailabilityBandSortItem<T>[] = params.results.map(
		(item) => {
			const slotStarts = params.slotStartsByBoatId.get(item.boat.id) ?? [];
			const rawAvailability = slotStarts.length;
			let weightedAvailability = 0;
			for (const slotStart of slotStarts) {
				const hour = getHourInTimeZone(slotStart, seedTimeZone);
				weightedAvailability += weightForHour(hour);
			}

			return {
				item,
				rawAvailability,
				weightedAvailability: Number(weightedAvailability.toFixed(4)),
				rand: computeDeterministicRandomKey(hourSeed, item.boat.id),
				group: 0,
			};
		}
	);

	decorated.sort((left, right) => left.rand - right.rand);

	const groups = new Map<number, DecoratedAvailabilityBandSortItem<T>[]>();
	for (let index = 0; index < groupCount; index++) {
		groups.set(index, []);
	}
	for (const [index, decoratedEntry] of decorated.entries()) {
		const group = index % groupCount;
		decoratedEntry.group = group;
		const groupEntries = groups.get(group);
		if (groupEntries) {
			groupEntries.push(decoratedEntry);
		}
	}

	const nonEmptyGroupIds = [...groups.entries()]
		.filter(([, entries]) => entries.length > 0)
		.map(([groupId]) => groupId)
		.sort((left, right) => left - right);

	const hourRotation = currentHour % groupCount;
	const orderedGroupIds = nonEmptyGroupIds
		.slice(hourRotation)
		.concat(nonEmptyGroupIds.slice(0, hourRotation));

	for (const groupId of orderedGroupIds) {
		groups.get(groupId)?.sort((left, right) => {
			if (right.weightedAvailability !== left.weightedAvailability) {
				return right.weightedAvailability - left.weightedAvailability;
			}
			if (right.rawAvailability !== left.rawAvailability) {
				return right.rawAvailability - left.rawAvailability;
			}
			return left.rand - right.rand;
		});
	}

	const ordered: T[] = [];
	for (const groupId of orderedGroupIds) {
		for (const entry of groups.get(groupId) ?? []) {
			ordered.push(entry.item);
		}
	}
	return ordered;
};
