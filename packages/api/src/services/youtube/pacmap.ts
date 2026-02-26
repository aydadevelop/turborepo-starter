/**
 * PaCMAP — Pairwise Controlled Manifold Approximation and Projection
 * TypeScript port with no external dependencies.
 *
 * Algorithm:
 *   1. Random projection to PROJ_DIMS for fast k-NN
 *   2. Exact k-NN with scaled distances (local adaptive sigma)
 *   3. Three pair types: Nearest-Neighbor (NN), Mid-Near (MN), Further (FP)
 *   4. Three-phase Adam optimisation: global → mixed → local structure
 *
 * Reference: https://www.jmlr.org/papers/volume22/20-1061/20-1061.pdf
 * Original Python: https://github.com/YingfanWang/PaCMAP
 */

// ─── Hyperparameters ─────────────────────────────────────────────────────────

const N_NEIGHBORS = 10;
const MN_RATIO = 0.5; // mid-near pairs per neighbor
const FP_RATIO = 2.0; // further pairs per neighbor
const LEARNING_RATE = 1.0;
const PHASE_ITERS = [100, 100, 250] as const; // [global, mixed, local]
const W_MN_INIT = 1000.0;
const BETA1 = 0.9;
const BETA2 = 0.999;
/** Reduce to this many dims via random projection before k-NN */
const PROJ_DIMS = 50;

// ─── Float32Array helpers (noUncheckedIndexedAccess compat) ──────────────────

function fa(arr: Float32Array, i: number): number {
	return (arr as unknown as Record<number, number>)[i] ?? 0;
}

function fas(arr: Float32Array, i: number, v: number): void {
	(arr as unknown as Record<number, number>)[i] = v;
}

// ─── Random Gaussian projection ───────────────────────────────────────────────

/**
 * Projects X (n × origDim) to X̃ (n × k) via a random Gaussian matrix.
 * Preserves pairwise distances in expectation (Johnson–Lindenstrauss).
 */
function randomProject(X: number[][], k: number): Float32Array[] {
	const d = X[0]?.length ?? 0;
	const scale = 1.0 / Math.sqrt(k);

	// Build column-major projection matrix R (d × k)
	const R: Float32Array[] = Array.from({ length: k }, () => {
		const col = new Float32Array(d);
		for (let i = 0; i < d; i++) {
			// Box-Muller Gaussian sample
			const u1 = Math.random() || 1e-10;
			const u2 = Math.random();
			fas(col, i, Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * scale);
		}
		return col;
	});

	return X.map((row) => {
		const proj = new Float32Array(k);
		for (let j = 0; j < k; j++) {
			let dot = 0;
			const col = R[j]!;
			for (let di = 0; di < d; di++) dot += (row[di] ?? 0) * fa(col, di);
			fas(proj, j, dot);
		}
		return proj;
	});
}

// ─── Normalise projected data in-place ───────────────────────────────────────

function centerScale(X: Float32Array[]): void {
	const n = X.length;
	const d = X[0]?.length ?? 0;
	const mean = new Float32Array(d);
	for (const row of X) {
		for (let j = 0; j < d; j++) fas(mean, j, fa(mean, j) + fa(row, j) / n);
	}
	let maxAbs = 1e-10;
	for (const row of X) {
		for (let j = 0; j < d; j++) maxAbs = Math.max(maxAbs, Math.abs(fa(row, j) - fa(mean, j)));
	}
	for (const row of X) {
		for (let j = 0; j < d; j++) fas(row, j, (fa(row, j) - fa(mean, j)) / maxAbs);
	}
}

// ─── k-NN (exact, euclidean) ─────────────────────────────────────────────────

function euclidSq(a: Float32Array, b: Float32Array, d: number): number {
	let s = 0;
	for (let i = 0; i < d; i++) {
		const diff = fa(a, i) - fa(b, i);
		s += diff * diff;
	}
	return s;
}

function computeKNN(
	X: Float32Array[],
	k: number,
	d: number,
): { nbrs: number[][]; dists: number[][] } {
	const n = X.length;
	const nbrs: number[][] = [];
	const knnDist: number[][] = [];

	for (let i = 0; i < n; i++) {
		const row = X[i]!;
		const candidates: Array<{ idx: number; dist: number }> = [];
		for (let j = 0; j < n; j++) {
			if (j === i) continue;
			candidates.push({ idx: j, dist: Math.sqrt(euclidSq(row, X[j]!, d)) });
		}
		candidates.sort((a, b) => a.dist - b.dist);

		const nbrRow: number[] = [];
		const distRow: number[] = [];
		for (let t = 0; t < k; t++) {
			nbrRow.push(candidates[t]!.idx);
			distRow.push(candidates[t]!.dist);
		}
		nbrs.push(nbrRow);
		knnDist.push(distRow);
	}
	return { nbrs, dists: knnDist };
}

// ─── Scale distances by local sigma ──────────────────────────────────────────

function scaleDist(dists: number[][], nbrs: number[][]): number[][] {
	// sigma[i] = mean(knn_dist[i][3:6])  (local neighbourhood scale)
	const sigma: number[] = dists.map((row) => {
		let s = 0;
		let cnt = 0;
		for (let t = 3; t < Math.min(6, row.length); t++) {
			s += row[t]!;
			cnt++;
		}
		return Math.max(cnt > 0 ? s / cnt : (row[0] ?? 1e-10), 1e-10);
	});

	return dists.map((row, i) =>
		row.map((dist, j) => {
			const nbrJ = nbrs[i]![j]!;
			return (dist * dist) / sigma[i]! / sigma[nbrJ]!;
		}),
	);
}

// ─── Pair sampling ───────────────────────────────────────────────────────────

function sampleNNPairs(
	nbrs: number[][],
	scaledDists: number[][],
	n_neighbors: number,
): Array<[number, number]> {
	const pairs: Array<[number, number]> = [];
	for (let i = 0; i < nbrs.length; i++) {
		const nbrRow = nbrs[i]!;
		const sd = scaledDists[i]!;
		const order = Array.from({ length: nbrRow.length }, (_, t) => t).sort(
			(a, b) => sd[a]! - sd[b]!,
		);
		for (let t = 0; t < Math.min(n_neighbors, nbrRow.length); t++) {
			pairs.push([i, nbrRow[order[t]!]!]);
		}
	}
	return pairs;
}

/**
 * Mid-near pairs: sample 6 random points, discard the nearest,
 * then pick the nearest from the remaining 5. This captures "medium-range"
 * structure rather than closest neighbours.
 */
function sampleMNPairs(X: Float32Array[], n_MN: number, d: number): Array<[number, number]> {
	const n = X.length;
	const pairs: Array<[number, number]> = [];

	for (let i = 0; i < n; i++) {
		const rowI = X[i]!;
		const excluded = new Set<number>([i]);

		for (let m = 0; m < n_MN; m++) {
			// Sample 6 unique points not already chosen for this point
			const sampled: number[] = [];
			let att = 0;
			while (sampled.length < 6 && att < n * 3) {
				const r = Math.floor(Math.random() * n);
				if (!excluded.has(r) && !sampled.includes(r)) sampled.push(r);
				att++;
			}
			if (sampled.length < 2) {
				if (sampled.length === 1) {
					pairs.push([i, sampled[0]!]);
					excluded.add(sampled[0]!);
				}
				continue;
			}

			// Find nearest among sampled, remove it, then pick next nearest
			let minT = 0;
			let minD = euclidSq(rowI, X[sampled[0]!]!, d);
			for (let t = 1; t < sampled.length; t++) {
				const sd = euclidSq(rowI, X[sampled[t]!]!, d);
				if (sd < minD) {
					minD = sd;
					minT = t;
				}
			}
			sampled.splice(minT, 1);

			let bestT = 0;
			let bestD = euclidSq(rowI, X[sampled[0]!]!, d);
			for (let t = 1; t < sampled.length; t++) {
				const sd = euclidSq(rowI, X[sampled[t]!]!, d);
				if (sd < bestD) {
					bestD = sd;
					bestT = t;
				}
			}
			const picked = sampled[bestT]!;
			pairs.push([i, picked]);
			excluded.add(picked);
		}
	}
	return pairs;
}

/** Further pairs: random pairs that are NOT nearest neighbours */
function sampleFPPairs(
	n: number,
	n_FP: number,
	pairNN: Array<[number, number]>,
): Array<[number, number]> {
	const neighborOf: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
	for (const [i, j] of pairNN) neighborOf[i]!.add(j);

	const pairs: Array<[number, number]> = [];
	for (let i = 0; i < n; i++) {
		const excluded = new Set<number>([i, ...neighborOf[i]!]);
		let found = 0;
		let att = 0;
		while (found < n_FP && att < n_FP * 20) {
			const j = Math.floor(Math.random() * n);
			if (!excluded.has(j)) {
				excluded.add(j);
				pairs.push([i, j]);
				found++;
			}
			att++;
		}
	}
	return pairs;
}

// ─── Gradient ────────────────────────────────────────────────────────────────

/**
 * PaCMAP gradient for three pair types:
 *  - NN:  attract  d_ij / (10 + d_ij)
 *  - MN:  attract  d_ij / (10000 + d_ij)  (weak, global structure)
 *  - FP:  repel    1 / (1 + d_ij)
 *
 * Where d_ij = 1 + |y_i - y_j|²  (denominator-shifted squared distance).
 */
function pacmapGrad(
	Y: Float32Array,
	n: number,
	pairNN: Array<[number, number]>,
	pairMN: Array<[number, number]>,
	pairFP: Array<[number, number]>,
	w_NN: number,
	w_MN: number,
	w_FP: number,
): Float32Array {
	const grad = new Float32Array((n + 1) * 2);

	for (const [i, j] of pairNN) {
		const d0 = fa(Y, i * 2) - fa(Y, j * 2);
		const d1 = fa(Y, i * 2 + 1) - fa(Y, j * 2 + 1);
		const dij = 1 + d0 * d0 + d1 * d1;
		const w = w_NN * (20 / (10 + dij) ** 2);
		fas(grad, i * 2, fa(grad, i * 2) + w * d0);
		fas(grad, i * 2 + 1, fa(grad, i * 2 + 1) + w * d1);
		fas(grad, j * 2, fa(grad, j * 2) - w * d0);
		fas(grad, j * 2 + 1, fa(grad, j * 2 + 1) - w * d1);
	}

	for (const [i, j] of pairMN) {
		const d0 = fa(Y, i * 2) - fa(Y, j * 2);
		const d1 = fa(Y, i * 2 + 1) - fa(Y, j * 2 + 1);
		const dij = 1 + d0 * d0 + d1 * d1;
		const w = w_MN * (20000 / (10000 + dij) ** 2);
		fas(grad, i * 2, fa(grad, i * 2) + w * d0);
		fas(grad, i * 2 + 1, fa(grad, i * 2 + 1) + w * d1);
		fas(grad, j * 2, fa(grad, j * 2) - w * d0);
		fas(grad, j * 2 + 1, fa(grad, j * 2 + 1) - w * d1);
	}

	for (const [i, j] of pairFP) {
		const d0 = fa(Y, i * 2) - fa(Y, j * 2);
		const d1 = fa(Y, i * 2 + 1) - fa(Y, j * 2 + 1);
		const dij = 1 + d0 * d0 + d1 * d1;
		const w = w_FP * (2 / (1 + dij) ** 2);
		fas(grad, i * 2, fa(grad, i * 2) - w * d0);
		fas(grad, i * 2 + 1, fa(grad, i * 2 + 1) - w * d1);
		fas(grad, j * 2, fa(grad, j * 2) + w * d0);
		fas(grad, j * 2 + 1, fa(grad, j * 2 + 1) + w * d1);
	}

	return grad;
}

// ─── Three-phase weight schedule ─────────────────────────────────────────────

function phaseWeights(
	itr: number,
	p1: number,
	p2: number,
): { w_NN: number; w_MN: number; w_FP: number } {
	if (itr < p1) {
		const t = itr / p1;
		// Phase 1: strong MN weight decays from W_MN_INIT → 3 (global structure)
		return { w_MN: (1 - t) * W_MN_INIT + t * 3, w_NN: 2, w_FP: 1 };
	}
	if (itr < p1 + p2) {
		// Phase 2: balanced weights
		return { w_MN: 3, w_NN: 3, w_FP: 1 };
	}
	// Phase 3: MN disabled, local structure refined
	return { w_MN: 0, w_NN: 1, w_FP: 1 };
}

// ─── Adam optimiser step ─────────────────────────────────────────────────────

function adamUpdate(
	Y: Float32Array,
	grad: Float32Array,
	m: Float32Array,
	v: Float32Array,
	itr: number,
): void {
	const lrt =
		(LEARNING_RATE * Math.sqrt(1 - BETA2 ** (itr + 1))) / (1 - BETA1 ** (itr + 1));
	for (let k = 0; k < Y.length; k++) {
		const g = fa(grad, k);
		const mk = fa(m, k) + (1 - BETA1) * (g - fa(m, k));
		const vk = fa(v, k) + (1 - BETA2) * (g * g - fa(v, k));
		fas(m, k, mk);
		fas(v, k, vk);
		fas(Y, k, fa(Y, k) - (lrt * mk) / (Math.sqrt(vk) + 1e-7));
	}
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Project high-dimensional vectors to 2D using PaCMAP.
 *
 * Compared to UMAP, PaCMAP better preserves both local and global structure
 * by explicitly modelling three pair types during optimisation.
 */
export function pacmapTo2D(vectors: number[][]): Array<{ x: number; y: number }> {
	const n = vectors.length;
	if (n < 3) return vectors.map(() => ({ x: 0, y: 0 }));

	const origDim = vectors[0]?.length ?? 0;

	// Step 1: Reduce to PROJ_DIMS via random projection for efficient k-NN
	const projDim = Math.min(PROJ_DIMS, origDim);
	let X: Float32Array[];
	if (origDim > projDim) {
		X = randomProject(vectors, projDim);
	} else {
		X = vectors.map((row) => {
			const arr = new Float32Array(origDim);
			for (let i = 0; i < origDim; i++) fas(arr, i, row[i] ?? 0);
			return arr;
		});
	}
	centerScale(X);
	const d = projDim;

	// Step 2: k-NN (extra candidates for scaled-distance selection)
	const n_neighbors = Math.min(N_NEIGHBORS, n - 1);
	const n_MN = Math.max(1, Math.round(n_neighbors * MN_RATIO));
	const n_FP = Math.max(1, Math.round(n_neighbors * FP_RATIO));
	const k_extra = Math.min(n_neighbors + 50, n - 1);

	const { nbrs, dists } = computeKNN(X, k_extra, d);
	const scaledDists = scaleDist(dists, nbrs);

	// Step 3: Sample all three pair types
	const pairNN = sampleNNPairs(nbrs, scaledDists, n_neighbors);
	const pairMN = sampleMNPairs(X, n_MN, d);
	const pairFP = sampleFPPairs(n, n_FP, pairNN);

	// Step 4: Initialise embedding from first two projected components (PCA-init approx)
	const Y = new Float32Array(n * 2);
	for (let i = 0; i < n; i++) {
		fas(Y, i * 2, fa(X[i]!, 0) * 0.01);
		fas(Y, i * 2 + 1, fa(X[i]!, 1) * 0.01);
	}

	// Step 5: Adam optimisation across three phases
	const mAdam = new Float32Array(n * 2);
	const vAdam = new Float32Array(n * 2);
	const [p1, p2, p3] = PHASE_ITERS;
	const totalIters = p1 + p2 + p3;

	for (let itr = 0; itr < totalIters; itr++) {
		const { w_NN, w_MN, w_FP } = phaseWeights(itr, p1, p2);
		const grad = pacmapGrad(Y, n, pairNN, pairMN, pairFP, w_NN, w_MN, w_FP);
		adamUpdate(Y, grad, mAdam, vAdam, itr);
	}

	return Array.from({ length: n }, (_, i) => ({
		x: fa(Y, i * 2),
		y: fa(Y, i * 2 + 1),
	}));
}
