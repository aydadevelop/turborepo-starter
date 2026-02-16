import type { MaskInputOptions } from "./input";
import { MaskInput } from "./input";

export function maska(node: HTMLInputElement, config: MaskInputOptions = {}) {
	const instance = new MaskInput(node, config);

	return {
		update(newConfig: MaskInputOptions) {
			instance.update(newConfig);
		},
		destroy() {
			instance.destroy();
		},
	};
}
