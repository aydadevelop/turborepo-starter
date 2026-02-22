import z from "zod";

// ─── Discovery Queue ─────────────────────────────────────────────────────────

export const ytDiscoveryQueueMessageSchema = z.object({
	kind: z.literal("yt.discovery.v1"),
	feedId: z.string().trim().min(1),
	organizationId: z.string().trim().min(1),
});

export type YtDiscoveryQueueMessage = z.infer<
	typeof ytDiscoveryQueueMessageSchema
>;

// ─── Ingest Queue ────────────────────────────────────────────────────────────

export const ytIngestQueueMessageSchema = z.object({
	kind: z.literal("yt.ingest.v1"),
	videoId: z.string().trim().min(1),
	organizationId: z.string().trim().min(1),
	youtubeVideoId: z.string().trim().min(1),
	/** Force audio download + Whisper even if captions are available */
	forceAsr: z.boolean().default(false),
});

export type YtIngestQueueMessage = z.infer<typeof ytIngestQueueMessageSchema>;

// ─── Vectorize Queue ─────────────────────────────────────────────────────────

export const ytVectorizeQueueMessageSchema = z.object({
	kind: z.literal("yt.vectorize.v1"),
	transcriptId: z.string().trim().min(1),
	videoId: z.string().trim().min(1),
	organizationId: z.string().trim().min(1),
});

export type YtVectorizeQueueMessage = z.infer<
	typeof ytVectorizeQueueMessageSchema
>;

// ─── NLP / Signal Extraction Queue ───────────────────────────────────────────

export const ytNlpQueueMessageSchema = z.object({
	kind: z.literal("yt.nlp.v1"),
	transcriptId: z.string().trim().min(1),
	videoId: z.string().trim().min(1),
	organizationId: z.string().trim().min(1),
});

export type YtNlpQueueMessage = z.infer<typeof ytNlpQueueMessageSchema>;

// ─── Cluster Queue ───────────────────────────────────────────────────────────

export const ytClusterQueueMessageSchema = z.object({
	kind: z.literal("yt.cluster.v1"),
	signalId: z.string().trim().min(1),
	organizationId: z.string().trim().min(1),
});

export type YtClusterQueueMessage = z.infer<typeof ytClusterQueueMessageSchema>;

// ─── Transcribe Queue ────────────────────────────────────────────────────────

export const ytTranscribeQueueMessageSchema = z.object({
	kind: z.literal("yt.transcribe.v1"),
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
