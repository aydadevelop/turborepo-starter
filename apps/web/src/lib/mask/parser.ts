import type { MaskOptions, MaskType } from "./mask";
import type { MaskTokens } from "./tokens";

const parseJson = (value: string): unknown =>
	JSON.parse(value.replaceAll("'", '"'));

export const parseInput = (
	input: HTMLInputElement,
	defaults: MaskOptions = {},
): MaskOptions => {
	const opts = { ...defaults };

	if (input.dataset.maska != null && input.dataset.maska !== "") {
		opts.mask = parseMask(input.dataset.maska);
	}
	if (input.dataset.maskaEager != null) {
		opts.eager = parseBool(input.dataset.maskaEager);
	}
	if (input.dataset.maskaReversed != null) {
		opts.reversed = parseBool(input.dataset.maskaReversed);
	}
	if (input.dataset.maskaTokensReplace != null) {
		opts.tokensReplace = parseBool(input.dataset.maskaTokensReplace);
	}
	if (input.dataset.maskaTokens != null) {
		opts.tokens = parseTokens(input.dataset.maskaTokens);
	}

	return opts;
};

const parseBool = (value: string): boolean =>
	value === "" ? true : Boolean(JSON.parse(value));

const parseMask = (value: string): MaskType =>
	value.startsWith("[") && value.endsWith("]")
		? (parseJson(value) as string[])
		: value;

const parseTokens = (value: string): MaskTokens => {
	if (value.startsWith("{") && value.endsWith("}")) {
		return parseJson(value) as MaskTokens;
	}

	const tkns: MaskTokens = {};
	for (const token of value.split("|")) {
		const parts = token.split(":");
		tkns[parts[0]] = {
			pattern: new RegExp(parts[1]),
			optional: parts[2] === "optional",
			multiple: parts[2] === "multiple",
			repeated: parts[2] === "repeated",
		};
	}

	return tkns;
};
