import { db } from "@my-app/db";
import { ytFeed, ytVideo } from "@my-app/db/schema/youtube";
import { getChannelVideos } from "@my-app/youtube/channel";
import { searchYouTube } from "@my-app/youtube/search";
import { and, eq } from "drizzle-orm";
import type {
	QueueProducer,
	YtDiscoveryQueueMessage,
} from "../../contracts/youtube-queue";

export interface YtDiscoveryDependencies {
	ytIngestQueue?: QueueProducer;
}

export type ProcessYtDiscoveryMessageResult =
	| "processed"
	| "skipped_inactive_or_missing";

export interface ProcessYtDiscoveryMessageOptions {
	dependencies: YtDiscoveryDependencies;
	message: YtDiscoveryQueueMessage;
}

export const processYtDiscoveryMessage = async ({
	message,
}: ProcessYtDiscoveryMessageOptions): Promise<ProcessYtDiscoveryMessageResult> => {
	const { feedId, organizationId } = message;

	// 1. Load the feed
	const [feed] = await db
		.select()
		.from(ytFeed)
		.where(
			and(eq(ytFeed.id, feedId), eq(ytFeed.organizationId, organizationId))
		)
		.limit(1);

	if (!feed || feed.status !== "active") {
		return "skipped_inactive_or_missing";
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

	return "processed";
};
