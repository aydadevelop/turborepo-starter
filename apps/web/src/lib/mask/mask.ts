import { processNumber } from "./number";
import type { MaskTokens } from "./tokens";
import { tokens } from "./tokens";

export type MaskType = string | string[] | ((input: string) => string) | null;

interface MaskNumber {
	fraction?: number;
	locale?: string;
	unsigned?: boolean;
}

export interface MaskOptions {
	eager?: boolean;
	mask?: MaskType;
	number?: MaskNumber;
	reversed?: boolean;
	tokens?: MaskTokens;
	tokensReplace?: boolean;
}

export class Mask {
	readonly opts: MaskOptions = {};
	private readonly memo = new Map<string, string>();

	constructor(defaults: MaskOptions = {}) {
		const opts = { ...defaults };

		if (opts.tokens != null) {
			opts.tokens = (opts.tokensReplace as boolean)
				? { ...opts.tokens }
				: { ...tokens, ...opts.tokens };

			for (const token of Object.values(opts.tokens)) {
				if (typeof token.pattern === "string") {
					token.pattern = new RegExp(token.pattern);
				}
			}
		} else {
			opts.tokens = tokens;
		}

		if (Array.isArray(opts.mask)) {
			if (opts.mask.length > 1) {
				opts.mask = [...opts.mask].sort((a, b) => a.length - b.length);
			} else {
				opts.mask = opts.mask[0] ?? "";
			}
		}
		if (opts.mask === "") {
			opts.mask = null;
		}

		this.opts = opts;
	}

	masked(value: string): string {
		return this.process(value, this.findMask(value));
	}

	unmasked(value: string): string {
		return this.process(value, this.findMask(value), false);
	}

	isEager(): boolean {
		return this.opts.eager === true;
	}

	isReversed(): boolean {
		return this.opts.reversed === true;
	}

	completed(value: string): boolean {
		const mask = this.findMask(value);

		if (this.opts.mask == null || mask == null) {
			return false;
		}

		const length = this.process(value, mask).length;

		if (typeof this.opts.mask === "string") {
			return length >= this.opts.mask.length;
		}

		return length >= mask.length;
	}

	private findMask(value: string): string | null {
		const mask = this.opts.mask;

		if (mask == null) {
			return null;
		}
		if (typeof mask === "string") {
			return mask;
		}
		if (typeof mask === "function") {
			return mask(value);
		}

		const l = this.process(value, mask.at(-1) ?? "", false);

		return (
			mask.find((el) => this.process(value, el, false).length >= l.length) ?? ""
		);
	}

	private escapeMask(maskRaw: string): { mask: string; escaped: number[] } {
		const chars: string[] = [];
		const escaped: number[] = [];

		for (const [i, ch] of maskRaw.split("").entries()) {
			if (ch === "!" && maskRaw[i - 1] !== "!") {
				escaped.push(i - escaped.length);
			} else {
				chars.push(ch);
			}
		}

		return { mask: chars.join(""), escaped };
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: mask processing requires complex state machine
	private process(
		value: string,
		maskRaw: string | null,
		masked = true
	): string {
		if (this.opts.number != null) {
			return processNumber(value, masked, this.opts);
		}

		if (maskRaw == null) {
			return value;
		}

		const memoKey = `v=${value},mr=${maskRaw},m=${masked ? 1 : 0}`;

		const cached = this.memo.get(memoKey);
		if (cached !== undefined) {
			return cached;
		}

		const { mask, escaped } = this.escapeMask(maskRaw);
		const result: string[] = [];
		const tkns = this.opts.tokens ?? {};
		const offset = this.isReversed() ? -1 : 1;
		const method = this.isReversed() ? "unshift" : "push";
		const lastMaskChar = this.isReversed() ? 0 : mask.length - 1;

		const check = this.isReversed()
			? () => m > -1 && v > -1
			: () => m < mask.length && v < value.length;

		const notLastMaskChar = (pos: number): boolean =>
			(!this.isReversed() && pos <= lastMaskChar) ||
			(this.isReversed() && pos >= lastMaskChar);

		let lastRawMaskChar: string | undefined;
		let repeatedPos = -1;
		let m = this.isReversed() ? mask.length - 1 : 0;
		let v = this.isReversed() ? value.length - 1 : 0;
		let multipleMatched = false;

		while (check()) {
			const maskChar = mask.charAt(m);
			const token = tkns[maskChar];
			const valueChar =
				token?.transform != null
					? token.transform(value.charAt(v))
					: value.charAt(v);

			if (!escaped.includes(m) && token != null) {
				if (valueChar.match(token.pattern) != null) {
					result[method](valueChar);

					if (token.repeated as boolean) {
						if (repeatedPos === -1) {
							repeatedPos = m;
						} else if (m === lastMaskChar && m !== repeatedPos) {
							m = repeatedPos - offset;
						}

						if (lastMaskChar === repeatedPos) {
							m -= offset;
						}
					} else if (token.multiple as boolean) {
						multipleMatched = true;
						m -= offset;
					}

					m += offset;
				} else if (token.multiple as boolean) {
					if (multipleMatched) {
						m += offset;
						v -= offset;
						multipleMatched = false;
					}
				} else if (valueChar === lastRawMaskChar) {
					lastRawMaskChar = undefined;
				} else if (token.optional as boolean) {
					m += offset;
					v -= offset;
				}

				v += offset;
			} else {
				if (masked && !this.isEager()) {
					result[method](maskChar);
				}

				if (valueChar === maskChar && !this.isEager()) {
					v += offset;
				} else {
					lastRawMaskChar = maskChar;
				}

				if (!this.isEager()) {
					m += offset;
				}
			}

			if (this.isEager()) {
				while (
					notLastMaskChar(m) &&
					(tkns[mask.charAt(m)] == null || escaped.includes(m))
				) {
					if (masked) {
						result[method](mask.charAt(m));

						if (value.charAt(v) === mask.charAt(m)) {
							m += offset;
							v += offset;
							continue;
						}
					} else if (mask.charAt(m) === value.charAt(v)) {
						v += offset;
					}

					m += offset;
				}
			}
		}

		const res = result.join("");
		this.memo.set(memoKey, res);

		return res;
	}
}
