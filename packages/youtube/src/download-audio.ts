import z from "zod";
import { fetchPlayerResponse } from "./page";

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const downloadAudioOptionsSchema = z.object({
	youtubeVideoId: z.string().trim().min(1),
	format: z.enum(["m4a", "mp3", "opus", "wav"]).default("m4a"),
});

export type DownloadAudioOptions = z.infer<typeof downloadAudioOptionsSchema>;

export interface DownloadAudioResult {
	/** MIME type of the audio */
	contentType: string;
	/** Raw audio bytes — Uint8Array works in both Node.js and CF Workers */
	data: Uint8Array;
	/** Actual file extension of the returned audio */
	extension: string;
}

// ─── Implementation ──────────────────────────────────────────────────────────

interface AdaptiveFormat {
	bitrate: number;
	/** File size in bytes as a string — provided by the InnerTube ANDROID client */
	contentLength?: string;
	itag: number;
	mimeType: string;
	/** Direct URL — absent when the format uses signature cipher */
	url?: string;
}

const MIME_TYPES: Record<string, string> = {
	m4a: "audio/mp4",
	mp3: "audio/mpeg",
	opus: "audio/webm; codecs=opus",
	wav: "audio/wav",
};

/**
 * Download audio from a YouTube video using the InnerTube ANDROID client API.
 *
 * Strategy:
 * 1. Try progressive `formats` (itag=18, combined video+audio MP4) — these
 *    allow full multi-chunk range downloads without n-parameter throttling.
 * 2. Fall back to `adaptiveFormats` audio-only streams (subject to throttle).
 *
 * The returned bytes may include video data in the progressive case, but the
 * audio track is fully intact and suitable for transcription.
 *
 * Compatible with Cloudflare Workers and any fetch-capable runtime.
 */
export async function downloadAudio(
	options: DownloadAudioOptions
): Promise<DownloadAudioResult> {
	const playerData = await fetchPlayerResponse(options.youtubeVideoId);
	const streamingData = playerData.streamingData as
		| Record<string, unknown>
		| undefined;

	// Prefer progressive formats (no n-throttle, sequential chunks work)
	const progressiveFormats = (streamingData?.formats ?? []) as AdaptiveFormat[];
	const progressiveMp4 = progressiveFormats.find(
		(f) => f.url && f.mimeType.startsWith("video/mp4")
	);

	if (progressiveMp4?.url) {
		const data = await downloadChunked(
			progressiveMp4.url,
			Number(progressiveMp4.contentLength ?? 0)
		);
		return { data, contentType: "video/mp4", extension: "mp4" };
	}

	// Fall back to adaptive audio tracks
	const adaptiveFormats = (streamingData?.adaptiveFormats ??
		[]) as AdaptiveFormat[];
	const audioFormats = adaptiveFormats.filter(
		(f) => f.url && f.mimeType.startsWith("audio/")
	);

	if (audioFormats.length === 0) {
		throw new Error("No directly accessible audio formats found");
	}

	// Prefer opus/webm for opus requests, audio/mp4 (AAC) for everything else
	const wantOpus = options.format === "opus";
	const chosen =
		audioFormats.find((f) =>
			wantOpus ? f.mimeType.includes("webm") : f.mimeType.includes("mp4")
		) ?? audioFormats[0];

	if (!chosen?.url) {
		throw new Error("No audio format URL available");
	}

	const data = await downloadChunked(
		chosen.url,
		Number(chosen.contentLength ?? 0)
	);

	const actualExt = chosen.mimeType.includes("webm") ? "opus" : "m4a";

	return {
		data,
		contentType: MIME_TYPES[actualExt] ?? "audio/mp4",
		extension: actualExt,
	};
}

// ─── Chunked Download ────────────────────────────────────────────────────────

/** YouTube CDN maximum safe range size per request (256 KB). */
const CHUNK_SIZE = 262_144;
/** Number of concurrent range requests. */
const CONCURRENCY = 1;

const ANDROID_UA = "com.google.android.youtube/19.09.37 (Linux; U; Android 11)";

async function downloadChunked(
	url: string,
	contentLength: number
): Promise<Uint8Array> {
	const numChunks = Math.ceil(contentLength / CHUNK_SIZE);
	const chunks: Uint8Array[] = new Array(numChunks);

	for (let i = 0; i < numChunks; i += CONCURRENCY) {
		const batch = Array.from(
			{ length: Math.min(CONCURRENCY, numChunks - i) },
			async (_, k) => {
				const idx = i + k;
				const start = idx * CHUNK_SIZE;
				const end = Math.min((idx + 1) * CHUNK_SIZE - 1, contentLength - 1);
				// YouTube CDN adaptive streaming protocol requires:
				// - &range=start-end as a URL query parameter
				// - &rn=N (range number, 1-based) incremented per chunk
				const chunkUrl = `${url}&range=${start}-${end}&rn=${idx + 1}`;
				const res = await fetch(chunkUrl, {
					headers: { "User-Agent": ANDROID_UA },
				});
				if (!res.ok) {
					throw new Error(`Audio stream fetch failed: ${res.status}`);
				}
				chunks[idx] = new Uint8Array(await res.arrayBuffer());
			}
		);
		await Promise.all(batch);
	}

	const result = new Uint8Array(contentLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}
