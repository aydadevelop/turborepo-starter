import z from "zod";

export const ytQueueKinds = {
	discovery: "yt.discovery.v1",
	ingest: "yt.ingest.v1",
	vectorize: "yt.vectorize.v1",
	nlp: "yt.nlp.v1",
	cluster: "yt.cluster.v1",
	transcribe: "yt.transcribe.v1",
} as const;

export type YtQueueKind = (typeof ytQueueKinds)[keyof typeof ytQueueKinds];

export interface QueueSendOptions {
	contentType?: "text" | "bytes" | "json" | "v8";
	delaySeconds?: number;
}

export interface QueueProducer {
	send(message: unknown, options?: QueueSendOptions): Promise<void>;
}

export interface R2ReadableBucketLike {
	get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

export interface R2WritableBucketLike {
	put(
		key: string,
		value: ArrayBuffer | ArrayBufferView | string
	): Promise<unknown>;
}

export type R2BucketLike = R2ReadableBucketLike & R2WritableBucketLike;

// ─── Discovery Queue ─────────────────────────────────────────────────────────

export const ytDiscoveryQueueMessageSchema = z.object({
	kind: z.literal(ytQueueKinds.discovery),
	feedId: z.string().trim().min(1),
	organizationId: z.string().trim().min(1),
});

export type YtDiscoveryQueueMessage = z.infer<
	typeof ytDiscoveryQueueMessageSchema
>;

// ─── Ingest Queue ────────────────────────────────────────────────────────────

export const ytIngestQueueMessageSchema = z.object({
	kind: z.literal(ytQueueKinds.ingest),
	videoId: z.string().trim().min(1),
	organizationId: z.string().trim().min(1),
	youtubeVideoId: z.string().trim().min(1),
	/** Force audio download + Whisper even if captions are available */
	forceAsr: z.boolean().default(false),
	/**
	 * Whether this feed has ASR enabled. When false, videos without captions
	 * will fail rather than triggering an expensive audio download.
	 */
	enableAsr: z.boolean().default(false),
});

export type YtIngestQueueMessage = z.infer<typeof ytIngestQueueMessageSchema>;

// ─── Vectorize Queue ─────────────────────────────────────────────────────────

export const ytVectorizeQueueMessageSchema = z.object({
	kind: z.literal(ytQueueKinds.vectorize),
	transcriptId: z.string().trim().min(1),
	videoId: z.string().trim().min(1),
	organizationId: z.string().trim().min(1),
});

export type YtVectorizeQueueMessage = z.infer<
	typeof ytVectorizeQueueMessageSchema
>;

// ─── NLP / Signal Extraction Queue ───────────────────────────────────────────

export const ytNlpQueueMessageSchema = z.object({
	kind: z.literal(ytQueueKinds.nlp),
	transcriptId: z.string().trim().min(1),
	videoId: z.string().trim().min(1),
	organizationId: z.string().trim().min(1),
	/** Enabled extraction categories; undefined = all. */
	collectCategories: z.array(z.string()).optional(),
});

export type YtNlpQueueMessage = z.infer<typeof ytNlpQueueMessageSchema>;

// ─── Cluster Queue ───────────────────────────────────────────────────────────

export const ytClusterQueueMessageSchema = z.object({
	kind: z.literal(ytQueueKinds.cluster),
	signalId: z.string().trim().min(1),
	organizationId: z.string().trim().min(1),
});

export type YtClusterQueueMessage = z.infer<typeof ytClusterQueueMessageSchema>;

// ─── Transcribe Queue ────────────────────────────────────────────────────────

export const ytTranscribeQueueMessageSchema = z.object({
	kind: z.literal(ytQueueKinds.transcribe),
	transcriptId: z.string().trim().min(1),
	videoId: z.string().trim().min(1),
	organizationId: z.string().trim().min(1),
	/** R2 object key where the audio file is stored */
	audioR2Key: z.string().trim().min(1),
	/** MIME type of the stored audio */
	contentType: z.string().default("audio/mp4"),
});

export type YtTranscribeQueueMessage = z.infer<
	typeof ytTranscribeQueueMessageSchema
>;
