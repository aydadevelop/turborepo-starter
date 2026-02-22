interface MaskToken {
	multiple?: boolean;
	optional?: boolean;
	pattern: RegExp;
	repeated?: boolean;
	transform?: (char: string) => string;
}

export type MaskTokens = Record<string, MaskToken>;

export const tokens: MaskTokens = {
	"#": { pattern: /[0-9]/ },
	"@": { pattern: /[a-zA-Z]/ },
	"*": { pattern: /[a-zA-Z0-9]/ },
};
