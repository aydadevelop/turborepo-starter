import type { MaskOptions } from "./mask";
import { Mask } from "./mask";
import { parseInput } from "./parser";

type OnMaskaType = (detail: MaskaDetail) => void;
type MaskaTarget = string | NodeListOf<HTMLInputElement> | HTMLInputElement;

export interface MaskInputOptions extends MaskOptions {
	onMaska?: OnMaskaType | OnMaskaType[];
	postProcess?: (value: string) => string;
	preProcess?: (value: string) => string;
}

export interface MaskaDetail {
	completed: boolean;
	masked: string;
	unmasked: string;
}

export class MaskInput {
	readonly items = new Map<HTMLInputElement, Mask>();
	private readonly eventAbortController: AbortController;
	private options: MaskInputOptions;

	constructor(target: MaskaTarget, options: MaskInputOptions = {}) {
		this.options = options;
		this.eventAbortController = new AbortController();
		this.init(this.getInputs(target));
	}

	update(options: MaskInputOptions = {}): void {
		this.options = { ...options };
		this.init(Array.from(this.items.keys()));
	}

	updateValue(input: HTMLInputElement): void {
		if (input.value !== "" && input.value !== this.processInput(input).masked) {
			this.setValue(input, input.value);
		}
	}

	destroy(): void {
		this.eventAbortController.abort();
		this.items.clear();
	}

	private init(inputs: HTMLInputElement[]): void {
		const defaults = this.getOptions(this.options);

		for (const input of inputs) {
			if (!this.items.has(input)) {
				const { signal } = this.eventAbortController;
				input.addEventListener("input", this.onInput, {
					capture: true,
					signal,
				});
			}

			const mask = new Mask(parseInput(input, defaults));
			this.items.set(input, mask);

			queueMicrotask(() => this.updateValue(input));

			if (input.selectionStart === null && mask.isEager()) {
				console.warn("Maska: input of `%s` type is not supported", input.type);
			}
		}
	}

	private getInputs(target: MaskaTarget): HTMLInputElement[] {
		if (typeof target === "string") {
			return Array.from(document.querySelectorAll(target));
		}

		return "length" in target ? Array.from(target) : [target];
	}

	private getOptions(options: MaskInputOptions): MaskOptions {
		const { onMaska: _, preProcess: _p, postProcess: _pp, ...opts } = options;
		return opts;
	}

	private readonly onInput = (e: Event | InputEvent): void => {
		if (
			e instanceof CustomEvent &&
			e.type === "input" &&
			!e.isTrusted &&
			!e.bubbles
		) {
			return;
		}

		const input = e.target as HTMLInputElement;
		const mask = this.items.get(input) as Mask;
		const isDelete =
			"inputType" in e && (e as InputEvent).inputType.startsWith("delete");
		const isEager = mask.isEager();

		const value =
			isDelete && isEager && mask.unmasked(input.value) === ""
				? ""
				: input.value;

		this.fixCursor(input, isDelete, () => this.setValue(input, value));
	};

	private fixCursor(
		input: HTMLInputElement,
		isDelete: boolean,
		closure: () => void
	): void {
		const pos = input.selectionStart;
		const value = input.value;

		closure();

		if (pos === null || (pos === value.length && !isDelete)) {
			return;
		}

		const valueNew = input.value;
		const leftPart = value.slice(0, pos);
		const leftPartNew = valueNew.slice(0, pos);
		const unmasked = this.processInput(input, leftPart).unmasked;
		const unmaskedNew = this.processInput(input, leftPartNew).unmasked;
		let posFixed = pos;

		if (leftPart !== leftPartNew) {
			posFixed += isDelete
				? valueNew.length - value.length
				: unmasked.length - unmaskedNew.length;
		}

		input.setSelectionRange(posFixed, posFixed);
	}

	private setValue(input: HTMLInputElement, value: string): void {
		const detail = this.processInput(input, value);

		input.value = detail.masked;

		if (this.options.onMaska != null) {
			if (Array.isArray(this.options.onMaska)) {
				for (const f of this.options.onMaska) {
					f(detail);
				}
			} else {
				this.options.onMaska(detail);
			}
		}

		input.dispatchEvent(new CustomEvent<MaskaDetail>("maska", { detail }));
		input.dispatchEvent(new CustomEvent("input", { detail: detail.masked }));
	}

	private processInput(input: HTMLInputElement, value?: string): MaskaDetail {
		const mask = this.items.get(input) as Mask;
		let valueNew = value ?? input.value;

		if (this.options.preProcess != null) {
			valueNew = this.options.preProcess(valueNew);
		}

		let masked = mask.masked(valueNew);

		if (this.options.postProcess != null) {
			masked = this.options.postProcess(masked);
		}

		return {
			masked,
			unmasked: mask.unmasked(valueNew),
			completed: mask.completed(valueNew),
		};
	}
}
