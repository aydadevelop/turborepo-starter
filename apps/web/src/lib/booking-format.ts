const toDate = (value: Date | string): Date =>
	value instanceof Date ? value : new Date(value);

const formatBookingRange = (
	startsAt: Date | string,
	endsAt: Date | string
): string => {
	const start = toDate(startsAt);
	const end = toDate(endsAt);
	return `${new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(start)} - ${new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(end)}`;
};

const formatDateTime = (value: Date | string): string => {
	const date = toDate(value);
	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(date);
};

const formatMoney = (amountCents: number, currency: string): string =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		maximumFractionDigits: 2,
	}).format(amountCents / 100);

const formatSignedMoney = (amountCents: number, currency: string): string => {
	let sign = "";
	if (amountCents > 0) {
		sign = "+";
	} else if (amountCents < 0) {
		sign = "-";
	}
	return `${sign}${formatMoney(Math.abs(amountCents), currency)}`;
};

const toDateParam = (value: Date | string): string => {
	const date = toDate(value);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate()
	).padStart(2, "0")}`;
};

const toDateTimeLocalValue = (value: Date | string): string => {
	const date = toDate(value);
	const localTimestamp = date.getTime() - date.getTimezoneOffset() * 60_000;
	return new Date(localTimestamp).toISOString().slice(0, 16);
};

export {
	toDate,
	formatBookingRange,
	formatDateTime,
	formatMoney,
	formatSignedMoney,
	toDateParam,
	toDateTimeLocalValue,
};
