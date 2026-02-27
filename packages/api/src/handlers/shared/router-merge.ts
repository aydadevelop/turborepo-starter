type UnionToIntersection<T> = (
	T extends unknown
		? (value: T) => void
		: never
) extends (value: infer TResult) => void
	? TResult
	: never;

type MergeFragments<T extends readonly Record<string, unknown>[]> =
	UnionToIntersection<T[number]>;

export const mergeRouterFragments = <
	const T extends readonly Record<string, unknown>[],
>(
	...fragments: T
): MergeFragments<T> => {
	const merged: Record<string, unknown> = {};

	for (const fragment of fragments) {
		for (const [key, value] of Object.entries(fragment)) {
			if (key in merged) {
				throw new Error(`Duplicate router key detected while merging: ${key}`);
			}
			merged[key] = value;
		}
	}

	return merged as MergeFragments<T>;
};
