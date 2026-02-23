import { ytDiscoveryQueueMessageSchema } from "@my-app/api/contracts/youtube-queue";
import { db } from "@my-app/db";
import { ytFeed, ytVideo } from "@my-app/db/schema/youtube";
import { getChannelVideos } from "@my-app/youtube/channel";
import { searchYouTube } from "@my-app/youtube/search";
import { and, eq } from "drizzle-orm";

const MAX_RETRY_ATTEMPTS = 3;

interface QueueProducer {
	send(
		message: unknown,
		options?: {
			contentType?: "text" | "bytes" | "json" | "v8";
			delaySeconds?: number;
		}
	): Promise<void>;
}

interface YtDiscoveryDependencies {
	ytIngestQueue?: QueueProducer;
}

const handleDiscoveryMessage = async (
	queueMessage: Message,
	_dependencies: YtDiscoveryDependencies
) => {
	const parsed = ytDiscoveryQueueMessageSchema.safeParse(queueMessage.body);
	if (!parsed.success) {
		console.error("[yt-discovery] Unknown message shape", queueMessage.body);
		queueMessage.ack();
		return;
	}

	const { feedId, organizationId } = parsed.data;

	try {
		// 1. Load the feed
		const [feed] = await db
			.select()
			.from(ytFeed)
			.where(
				and(eq(ytFeed.id, feedId), eq(ytFeed.organizationId, organizationId))
			)
			.limit(1);

		if (!feed || feed.status !== "active") {
			console.warn(
				`[yt-discovery] Feed ${feedId} not found or not active, skipping`
			);
			queueMessage.ack();
			return;
		}

		// 2. Discover candidate videos — channel browse or keyword search
		const stopWords = feed.stopWords
			?.split(",")
			.map((w) => w.trim())
			.filter(Boolean);
		let candidates: {
			youtubeVideoId: string;
			title: string;
			channelId: string | null;
			channelName: string | null;
			description: string | null;
			duration: string | null;
			publishedAt: string | null;
			thumbnailUrl: string | null;
			viewCount: number | null;
		}[];

		if (feed.channelId) {
			console.log(
				`[yt-discovery] Browsing channel ${feed.channelId} for feed "${feed.name}"`
			);
			candidates = await getChannelVideos({
				channelId: feed.channelId,
				tab: "recent",
				maxResults: 20,
			});
		} else {
			console.log(
				`[yt-discovery] Searching YouTube for feed "${feed.name}": ${feed.searchQuery}`
			);
			candidates = await searchYouTube({
				query: feed.searchQuery,
				maxResults: 20,
				publishedAfter: feed.publishedAfter ?? undefined,
				stopWords,
			});
		}

		// 3. Insert new candidate rows (skip already-known videoIds)
		for (const candidate of candidates) {
			const existing = await db
				.select({ id: ytVideo.id })
				.from(ytVideo)
				.where(
					and(
						eq(ytVideo.feedId, feedId),
						eq(ytVideo.youtubeVideoId, candidate.youtubeVideoId)
					)
				)
				.limit(1);

			if (existing.length > 0) {
				continue;
			}

			await db.insert(ytVideo).values({
				id: crypto.randomUUID(),
				feedId,
				organizationId,
				youtubeVideoId: candidate.youtubeVideoId,
				title: candidate.title,
				channelId: candidate.channelId,
				channelName: candidate.channelName,
				description: candidate.description,
				duration: candidate.duration,
				publishedAt: candidate.publishedAt,
				thumbnailUrl: candidate.thumbnailUrl,
				viewCount: candidate.viewCount,
				status: "candidate",
			});
		}

		console.log(
			`[yt-discovery] Feed "${feed.name}": ${candidates.length} discovered, ${candidates.length} processed`
		);

		// 4. Update last discovery time
		await db
			.update(ytFeed)
			.set({ lastDiscoveryAt: new Date() })
			.where(eq(ytFeed.id, feedId));

		queueMessage.ack();
	} catch (error) {
		console.error(`[yt-discovery] Failed to process feed ${feedId}:`, error);
		if (queueMessage.attempts < MAX_RETRY_ATTEMPTS) {
			queueMessage.retry({
				delaySeconds: Math.min(queueMessage.attempts * 60, 300),
			});
			return;
		}
		queueMessage.ack();
	}
};

export const processYtDiscoveryBatch = async (
	batch: MessageBatch<unknown>,
	dependencies: YtDiscoveryDependencies
) => {
	for (const queueMessage of batch.messages) {
		await handleDiscoveryMessage(queueMessage, dependencies);
	}
};
