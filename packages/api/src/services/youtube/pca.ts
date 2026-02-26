/**
 * Simple PCA projection: projects high-dimensional vectors to 2D.
 * Uses power iteration to find top-2 principal components.
 */
export function projectTo2D(
	vectors: number[][]
): Array<{ x: number; y: number }> {
	if (vectors.length === 0) return [];
	if (vectors.length === 1) return [{ x: 0, y: 0 }];

	const n = vectors.length;
	const d = vectors[0]!.length;

	// 1. Center the data (subtract mean)
	const mean = new Float64Array(d);
	for (const v of vectors) {
		for (let j = 0; j < d; j++) mean[j]! += v[j]!;
	}
	for (let j = 0; j < d; j++) mean[j]! /= n;

	const centered: Float64Array[] = vectors.map((v) => {
		const c = new Float64Array(d);
		for (let j = 0; j < d; j++) c[j] = v[j]! - mean[j]!;
		return c;
	});

	// 2. Find top-2 principal components via power iteration on X^T X
	const pc1 = powerIteration(centered, d);
	// Deflate: remove pc1 component from each vector
	const deflated = centered.map((v) => {
		const dot = dotProduct(v, pc1);
		const c = new Float64Array(d);
		for (let j = 0; j < d; j++) c[j] = v[j]! - dot * pc1[j]!;
		return c;
	});
	const pc2 = powerIteration(deflated, d);

	// 3. Project onto pc1, pc2
	return centered.map((v) => ({
		x: dotProduct(v, pc1),
		y: dotProduct(v, pc2),
	}));
}

function dotProduct(a: Float64Array, b: Float64Array): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
	return sum;
}

function powerIteration(
	data: Float64Array[],
	d: number,
	maxIter = 50
): Float64Array {
	// Initialize with first data vector direction
	const v = new Float64Array(d);
	const seed = data[0]!;
	const seedNorm = Math.sqrt(dotProduct(seed, seed)) || 1;
	for (let j = 0; j < d; j++) v[j] = seed[j]! / seedNorm;

	const tmp = new Float64Array(d);

	for (let iter = 0; iter < maxIter; iter++) {
		// tmp = X^T * (X * v)
		tmp.fill(0);
		for (const row of data) {
			const proj = dotProduct(row, v);
			for (let j = 0; j < d; j++) {
				const rowVal = row[j] ?? 0;
				tmp[j] = (tmp[j] ?? 0) + proj * rowVal;
			}
		}

		// Normalize
		let norm = 0;
		for (let j = 0; j < d; j++) norm += tmp[j]! * tmp[j]!;
		norm = Math.sqrt(norm);
		if (norm < 1e-12) break;
		for (let j = 0; j < d; j++) v[j] = tmp[j]! / norm;
	}

	return v;
}
